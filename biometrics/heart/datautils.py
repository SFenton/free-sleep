'''
# Original Author:

- **Paul van Gent**
- [HeartPy on PyPI](https://pypi.org/project/heartpy/)
- [GitHub Repository](https://github.com/paulvangentcom/heartrate_analysis_python)
- [Heart Rate Analysis for Human Factors: Development and Validation of an Open-Source Toolkit for Noisy Naturalistic Heart Rate Data](https://www.researchgate.net/publication/325967542_Heart_Rate_Analysis_for_Human_Factors_Development_and_Validation_of_an_Open_Source_Toolkit_for_Noisy_Naturalistic_Heart_Rate_Data)
- [Analysing Noisy Driver Physiology in Real-Time Using Off-the-Shelf Sensors: Heart Rate Analysis Software from the Taking the Fast Lane Project](https://www.researchgate.net/publication/328654252_Analysing_Noisy_Driver_Physiology_Real-Time_Using_Off-the-Shelf_Sensors_Heart_Rate_Analysis_Software_from_the_Taking_the_Fast_Lane_Project?channel=doi&linkId=5bdab2c84585150b2b959d13&showFulltext=true)

Functions for loading and slicing data
'''

import numpy as np




def _sliding_window(data, windowsize):
    '''segments data into windows

    Function to segment data into windows for rolling mean function.
    Function returns the data segemented into sections.

    Parameters
    ----------
    data : 1d array or list
        array or list containing data over which sliding windows are computed

    windowsize : int
        size of the windows to be created by the function

    Returns
    -------
    out : array of arrays
        data segmented into separate windows.

    '''
    shape = data.shape[:-1] + (data.shape[-1] - windowsize + 1, windowsize)
    strides = data.strides + (data.strides[-1],)
    return np.lib.stride_tricks.as_strided(data, shape=shape, strides=strides)


def rolling_mean(hrdata: np.ndarray, windowsize: float, sample_rate: int) -> np.ndarray:
    win_size = int(windowsize * sample_rate)

    # Calculate rolling mean using a sliding window approach
    rol_mean = np.mean(_sliding_window(hrdata, win_size), axis=1)

    # Compute padding size
    n_missvals = (len(hrdata) - len(rol_mean)) // 2

    # Use np.full for efficient array creation
    missvals_a = np.full(n_missvals, rol_mean[0], dtype=hrdata.dtype)
    missvals_b = np.full(n_missvals, rol_mean[-1], dtype=hrdata.dtype)

    # Concatenate efficiently
    rol_mean = np.hstack((missvals_a, rol_mean, missvals_b))

    # Length correction if necessary
    len_diff = len(rol_mean) - len(hrdata)
    if len_diff < 0:
        rol_mean = np.append(rol_mean, np.zeros(-len_diff, dtype=hrdata.dtype))
    elif len_diff > 0:
        rol_mean = rol_mean[:len(hrdata)]

    return rol_mean




def MAD(data):
    """Computes median absolute deviation"""
    med = np.median(data)
    return np.median(np.abs(data - med))

