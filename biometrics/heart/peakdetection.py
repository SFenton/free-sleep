'''
# Original Author:

- **Paul van Gent**
- [HeartPy on PyPI](https://pypi.org/project/heartpy/)
- [GitHub Repository](https://github.com/paulvangentcom/heartrate_analysis_python)
- [Heart Rate Analysis for Human Factors: Development and Validation of an Open-Source Toolkit for Noisy Naturalistic Heart Rate Data](https://www.researchgate.net/publication/325967542_Heart_Rate_Analysis_for_Human_Factors_Development_and_Validation_of_an_Open_Source_Toolkit_for_Noisy_Naturalistic_Heart_Rate_Data)
- [Analysing Noisy Driver Physiology in Real-Time Using Off-the-Shelf Sensors: Heart Rate Analysis Software from the Taking the Fast Lane Project](https://www.researchgate.net/publication/328654252_Analysing_Noisy_Driver_Physiology_Real-Time_Using_Off-the-Shelf_Sensors_Heart_Rate_Analysis_Software_from_the_Taking_the_Fast_Lane_Project?channel=doi&linkId=5bdab2c84585150b2b959d13&showFulltext=true)


functions for peak detection and related tasks
'''
from typing import List, Dict, Union, Tuple
import numpy as np
from heart.analysis import calc_rr
from heart.analysis import update_rr
from heart.exceptions import BadSignalWarning
from data_types import *

__all__ = ['make_windows',
           'append_dict',
           'detect_peaks',
           'fit_peaks',
           'check_peaks',
           ]


def make_windows(data, sample_rate, windowsize=120, overlap=0, min_size=20):
    '''slices data into windows

    Funcion that slices data into windows for concurrent analysis.
    Used by process_segmentwise wrapper function.

    Parameters
    ----------
    data : 1-d array
        array containing heart rate sensor data

    sample_rate : int or float
        sample rate of the data stream in 'data'

    windowsize : int
        size of the window that is sliced in seconds

    overlap : float
        fraction of overlap between two adjacent windows: 0 <= float < 1.0

    min_size : int
        the minimum size for the last (partial) window to be included. Very short windows
        might not stable for peak fitting, especially when significant noise is present.
        Slightly longer windows are likely stable but don't make much sense from a
        signal analysis perspective.

    Returns
    -------
    out : array
        tuples of window indices

    Examples
    --------
    Assuming a given example data file:

    >>> import heartpy as hp
    >>> data, _ = hp.load_exampledata(1)

    We can split the data into windows:

    >>> indices = make_windows(data, 100.0, windowsize = 30, overlap = 0.5, min_size = 20)
    >>> indices.shape
    (9, 2)

    Specifying min_size = -1 will include the last window no matter what:

    >>> indices = make_windows(data, 100.0, windowsize = 30, overlap = 0.5, min_size = -1)
    '''
    ln = len(data)
    window = windowsize * sample_rate
    stepsize = (1 - overlap) * window
    start = 0
    end = window

    slices = []
    while end < len(data):
        slices.append((start, end))
        start += stepsize
        end += stepsize

    if min_size == -1:
        slices[-1] = (slices[-1][0], len(data))
    elif (ln - start) / sample_rate >= min_size:
        slices.append((start, ln))

    return np.array(slices, dtype=np.int32)


def append_dict(dict_obj, measure_key, measure_value):
    '''appends data to keyed dict.

    Function that appends key to continuous dict, creates if doesn't exist. EAFP

    Parameters
    ----------
    dict_obj : dict
        dictionary object that contains continuous output measures

    measure_key : str
        key for the measure to be stored in continuous_dict

    measure_value : any data container
        value to be appended to dictionary

    Returns
    -------
    dict_obj : dict
        dictionary object passed to function, with specified data container appended

    Examples
    --------
    Given a dict object 'example' with some data in it:

    >>> example = {}
    >>> example['call'] = ['hello']

    We can use the function to append it:

    >>> example = append_dict(example, 'call', 'world')
    >>> example['call']
    ['hello', 'world']

    A new key will be created if it doesn't exist:

    >>> example = append_dict(example, 'different_key', 'hello there!')
    >>> sorted(example.keys())
    ['call', 'different_key']
    '''
    try:
        dict_obj[measure_key].append(measure_value)
    except KeyError:
        dict_obj[measure_key] = [measure_value]
    return dict_obj


def detect_peaks(
        hrdata: np.ndarray,
        rol_mean: np.ndarray,
        ma_perc: float,
        sample_rate: int,
        working_data: Dict[str, Union[List[int], np.ndarray, float]]
) -> WorkingData:
    mean = np.mean(rol_mean / 100) * ma_perc
    rol_mean_copy = rol_mean + mean

    # Identify candidate peaks where hrdata exceeds the adjusted rolling mean
    peaks_x = np.where(hrdata > rol_mean_copy)[0]
    peaks_y = hrdata[peaks_x]
    # Identify peak segment boundaries
    peak_edges = np.concatenate(([0], np.where(np.diff(peaks_x) > 1)[0], [len(peaks_x)]))

    peaklist = []

    # Iterate through peak segments and find the highest peak in each segment
    for i in range(len(peak_edges) - 1):
        segment_values = peaks_y[peak_edges[i]:peak_edges[i + 1]].tolist()
        if segment_values:
            peaklist.append(peaks_x[peak_edges[i] + segment_values.index(max(segment_values))])

    working_data["peaklist"] = np.array(peaklist)
    working_data["ybeat"] = np.array([hrdata[x] for x in peaklist])
    working_data["rolling_mean"] = rol_mean_copy

    # Calculate RR intervals
    if len(working_data["peaklist"]) > 0:
        working_data = calc_rr(working_data["peaklist"], sample_rate, working_data=working_data)

    # Compute RR standard deviation
    if 'RR_list' in working_data and len(working_data['RR_list']) > 0:
        working_data['rrsd'] = np.std(working_data['RR_list'])
    else:
        working_data['rrsd'] = np.inf
    return working_data



def fit_peaks(
        hrdata: np.ndarray,
        rol_mean: np.ndarray,
        sample_rate: int,
        working_data: WorkingData,
        bpmmin: int = 40,
        bpmmax: int = 180,
):
    ma_perc_list = [
        # 5,
        # 10,
        # 15,
        # 20,
        # 25,
        # 30,
        40,
        50,
        60,
        70,
        80,
        90,
        100,
        110,
        120,
        # 150,
        # 200,
        # 300
    ]

    # Store results: (RR standard deviation, detected BPM, ma_perc)
    rrsd = []

    for ma_perc in ma_perc_list:
        detect_peaks(hrdata, rol_mean, ma_perc, sample_rate, working_data)
        bpm = ((len(working_data["peaklist"]) / (len(hrdata) / sample_rate)) * 60)
        rrsd.append((working_data["rrsd"], bpm, ma_perc))

    # Find valid MA percentages based on RR standard deviation and BPM range
    valid_ma = [(rrsd, ma_perc) for rrsd, bpm, ma_perc in rrsd if rrsd > 0.1 and bpmmin <= bpm <= bpmmax]

    if valid_ma:
        # Select the best moving average percentage based on lowest RRSD
        best_ma_perc = min(valid_ma, key=lambda x: x[0])[1]
        working_data["best_ma_perc"] = best_ma_perc

        # Re-run peak detection with the best MA percentage
        detect_peaks(hrdata, rol_mean, best_ma_perc, sample_rate, working_data)
    else:
        # Raise warning if no valid peak detection can be determined
        raise BadSignalWarning("Could not determine best fit, bad signal")


def check_peaks(working_data: WorkingData):
    mean_rr = np.mean(working_data['RR_list'])
    thirty_perc = 0.3 * mean_rr
    if thirty_perc <= 300:
        upper_threshold = mean_rr + 300
        lower_threshold = mean_rr - 300
    else:
        upper_threshold = mean_rr + thirty_perc
        lower_threshold = mean_rr - thirty_perc

    # identify peaks to exclude based on RR interval
    rem_idx = np.where((working_data['RR_list'] <= lower_threshold) | (working_data['RR_list'] >= upper_threshold))[0] + 1

    working_data['removed_beats'] = np.array(working_data['peaklist'])[rem_idx]
    working_data['removed_beats_y'] = np.array(working_data['ybeat'])[rem_idx]
    working_data['binary_peaklist'] = np.asarray([0 if x in working_data['removed_beats']
                                                  else 1 for x in working_data['peaklist']])

    update_rr(working_data)
