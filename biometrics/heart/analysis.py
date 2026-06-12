'''
# Original Author:

- **Paul van Gent**
    - [HeartPy on PyPI](https://pypi.org/project/heartpy/)
    - [GitHub Repository](https://github.com/paulvangentcom/heartrate_analysis_python)
    - [Heart Rate Analysis for Human Factors: Development and Validation of an Open-Source Toolkit for Noisy Naturalistic Heart Rate Data](https://www.researchgate.net/publication/325967542_Heart_Rate_Analysis_for_Human_Factors_Development_and_Validation_of_an_Open_Source_Toolkit_for_Noisy_Naturalistic_Heart_Rate_Data)
    - [Analysing Noisy Driver Physiology in Real-Time Using Off-the-Shelf Sensors: Heart Rate Analysis Software from the Taking the Fast Lane Project](https://www.researchgate.net/publication/328654252_Analysing_Noisy_Driver_Physiology_Real-Time_Using_Off-the-Shelf_Sensors_Heart_Rate_Analysis_Software_from_the_Taking_the_Fast_Lane_Project?channel=doi&linkId=5bdab2c84585150b2b959d13&showFulltext=true)


Functions that handle computation of heart rate (HR) and
heart rate variability (HRV) measures.
'''
import numpy as np
from scipy.interpolate import UnivariateSpline
from scipy.signal import welch, periodogram

from heart.datautils import MAD
from heart.filtering import quotient_filter, filter_signal
from data_types import *

__all__ = ['calc_rr',
           'update_rr',
           'clean_rr_intervals',
           'calc_ts_measures',
           'calc_breathing']


def calc_rr(peaklist: List[np.int64], sample_rate: int, working_data={}) -> WorkingData:
    # delete first peak if within first 150ms (signal might start mid-beat after peak)
    if len(peaklist) > 0:
        if peaklist[0] <= ((sample_rate / 1000.0) * 150):
            peaklist = np.delete(peaklist, 0)
            working_data['peaklist'] = peaklist
            working_data['ybeat'] = np.delete(working_data['ybeat'], 0)

    rr_list = (np.diff(peaklist) / sample_rate) * 1000.0
    rr_indices = [(peaklist[i], peaklist[i + 1]) for i in range(len(peaklist) - 1)]
    rr_diff = np.abs(np.diff(rr_list))
    rr_sqdiff = np.power(rr_diff, 2)
    working_data['RR_list'] = rr_list
    working_data['RR_indices'] = rr_indices
    working_data['RR_diff'] = rr_diff
    working_data['RR_sqdiff'] = rr_sqdiff
    return working_data


def update_rr(working_data: WorkingData):
    rr_source = working_data['RR_list']
    b_peaklist = working_data['binary_peaklist']
    rr_list = [rr_source[i] for i in range(len(rr_source)) if b_peaklist[i] + b_peaklist[i + 1] == 2]
    rr_mask = [0 if (b_peaklist[i] + b_peaklist[i + 1] == 2) else 1 for i in range(len(rr_source))]
    rr_masked = np.ma.array(rr_source, mask=rr_mask)
    rr_diff = np.abs(np.diff(rr_masked))
    rr_diff = rr_diff[~rr_diff.mask]
    rr_sqdiff = np.power(rr_diff, 2)

    working_data['RR_masklist'] = rr_mask
    working_data['RR_list_cor'] = rr_list
    working_data['RR_diff'] = rr_diff
    working_data['RR_sqdiff'] = rr_sqdiff




def clean_rr_intervals(working_data):
    rr_mask = quotient_filter(working_data['RR_list'], working_data['RR_masklist'])
    rr_cleaned = [x for x, y in zip(working_data['RR_list'], rr_mask) if y == 0]

    rr_masked = np.ma.array(working_data['RR_list'], mask=rr_mask)
    rr_diff = np.abs(np.diff(rr_masked))
    rr_diff = rr_diff[~rr_diff.mask]
    rr_sqdiff = np.power(rr_diff, 2)
    working_data['RR_masked'] = rr_masked
    working_data['RR_list_cor'] = np.asarray(rr_cleaned)
    working_data['RR_diff'] = rr_diff
    working_data['RR_sqdiff'] = rr_sqdiff

    try:
        removed_beats = [x for x in working_data['removed_beats']]
        removed_beats_y = [x for x in working_data['removed_beats_y']]
        peaklist = working_data['peaklist']
        ybeat = working_data['ybeat']

        for i in range(len(rr_mask)):
            if rr_mask[i] == 1 and peaklist[i] not in removed_beats:
                removed_beats.append(peaklist[i])
                removed_beats_y.append(ybeat[i])

        working_data['removed_beats'] = np.asarray(removed_beats)
        working_data['removed_beats_y'] = np.asarray(removed_beats_y)
    except:
        pass

    return working_data


def calc_ts_measures(rr_list, rr_diff, rr_sqdiff, measures: HeartPyMeasurement, working_data: WorkingData):
    # Heart rate
    measures['bpm'] = 60000 / np.mean(rr_list)
    # sdnn is HRV
    measures['sdnn'] = np.std(rr_list)
    # measures['ibi'] = np.mean(rr_list)
    # measures['sdsd'] = np.std(rr_diff)
    # measures['rmssd'] = np.sqrt(np.mean(rr_sqdiff))
    # nn20 = rr_diff[np.where(rr_diff > 20.0)]
    # nn50 = rr_diff[np.where(rr_diff > 50.0)]
    # working_data['nn20'] = nn20
    # working_data['nn50'] = nn50
    # try:
    #     measures['pnn20'] = float(len(nn20)) / float(len(rr_diff))
    # except:
    #     measures['pnn20'] = np.nan
    # try:
    #     measures['pnn50'] = float(len(nn50)) / float(len(rr_diff))
    # except:
    #     measures['pnn50'] = np.nan
    # measures['hr_mad'] = MAD(rr_list)


def calc_breathing(
        rrlist,
        measures: HeartPyMeasurement,
        working_data: WorkingData,
        method='welch',
        filter_breathing=True,
        bw_cutoff=[0.1, 0.4],
):
    # resample RR-list to 1000Hz
    x = np.linspace(0, len(rrlist), len(rrlist))
    x_new = np.linspace(0, len(rrlist), np.sum(rrlist, dtype=np.int32))
    interp = UnivariateSpline(x, rrlist, k=3)
    breathing = interp(x_new)

    if filter_breathing:
        breathing = filter_signal(
            breathing,
            cutoff=bw_cutoff,
            sample_rate=1000.0,
            filtertype='bandpass'
        )

    if method.lower() == 'fft':
        datalen = len(breathing)
        frq = np.fft.fftfreq(datalen, d=((1 / 1000.0)))
        frq = frq[range(int(datalen / 2))]
        Y = np.fft.fft(breathing) / datalen
        Y = Y[range(int(datalen / 2))]
        psd = np.power(np.abs(Y), 2)
    elif method.lower() == 'welch':
        if len(breathing) < 30000:
            frq, psd = welch(breathing, fs=1000, nperseg=len(breathing))
        else:
            frq, psd = welch(breathing, fs=1000, nperseg=np.clip(len(breathing) // 10,
                                                                 a_min=30000, a_max=None))
    elif method.lower() == 'periodogram':
        frq, psd = periodogram(breathing, fs=1000.0, nfft=30000)

    else:
        raise ValueError('Breathing rate extraction method not understood! Must be \'welch\' or \'fft\'!')

    # find max
    measures['breathingrate'] = frq[np.argmax(psd)]
    working_data['breathing_signal'] = breathing
    working_data['breathing_psd'] = psd
    working_data['breathing_frq'] = frq

    return measures, working_data


