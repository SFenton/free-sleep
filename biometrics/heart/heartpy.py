'''
# Original Author:

- **Paul van Gent**
- [HeartPy on PyPI](https://pypi.org/project/heartpy/)
- [GitHub Repository](https://github.com/paulvangentcom/heartrate_analysis_python)
- [Heart Rate Analysis for Human Factors: Development and Validation of an Open-Source Toolkit for Noisy Naturalistic Heart Rate Data](https://www.researchgate.net/publication/325967542_Heart_Rate_Analysis_for_Human_Factors_Development_and_Validation_of_an_Open_Source_Toolkit_for_Noisy_Naturalistic_Heart_Rate_Data)
- [Analysing Noisy Driver Physiology in Real-Time Using Off-the-Shelf Sensors: Heart Rate Analysis Software from the Taking the Fast Lane Project](https://www.researchgate.net/publication/328654252_Analysing_Noisy_Driver_Physiology_Real-Time_Using_Off-the-Shelf_Sensors_Heart_Rate_Analysis_Software_from_the_Taking_the_Fast_Lane_Project?channel=doi&linkId=5bdab2c84585150b2b959d13&showFulltext=true)


main module for HeartPy.
'''

import numpy as np
from typing import Tuple
from data_types import HeartPyMeasurement, WorkingData
from heart.datautils import rolling_mean

from heart.peakdetection import check_peaks, fit_peaks
from heart.analysis import clean_rr_intervals, calc_ts_measures, calc_breathing, calc_rr
import traceback



def process(
        hrdata: np.ndarray,
        sample_rate: int,
        windowsize: float = 0.75,
        bpmmin: int = 40,
        bpmmax: int = 180,
        breathing_method='welch',
        calculate_breathing=True,
) -> Tuple[dict, HeartPyMeasurement]:
    measures: HeartPyMeasurement = {}
    working_data: WorkingData = {}

    # check that the data has positive baseline for the moving average algorithm to work
    bl_val = np.percentile(hrdata, 0.1)
    if bl_val < 0:
        hrdata = hrdata + abs(bl_val)

    working_data['hr'] = hrdata
    working_data['sample_rate'] = sample_rate

    rol_mean = rolling_mean(
        hrdata,
        windowsize,
        sample_rate
    )

    fit_peaks(
        hrdata,
        rol_mean,
        sample_rate,
        working_data,
        bpmmin=bpmmin,
        bpmmax=bpmmax,
    )
    try:
        if type(working_data["peaklist"]) == list:
            working_data["peaklist"] = np.array(working_data["peaklist"])

        working_data = calc_rr(
            working_data["peaklist"],
            sample_rate,
            working_data=working_data
        )
    except Exception as e:
        error_message = traceback.format_exc()
        print(e)
        print(error_message)

    check_peaks(working_data)
    working_data = clean_rr_intervals(working_data)

    calc_ts_measures(
        working_data['RR_list_cor'],
        working_data['RR_diff'],
        working_data['RR_sqdiff'],
        measures,
        working_data
    )

    if calculate_breathing:
        try:
            measures, working_data = calc_breathing(
                working_data['RR_list_cor'],
                measures,
                working_data,
                method=breathing_method,
            )
        except:
            measures['breathingrate'] = np.nan
    return working_data, measures
