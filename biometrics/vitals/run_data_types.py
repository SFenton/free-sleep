from typing import Union, Tuple, TypedDict, List

import platform
import sys

if platform.system().lower() == 'linux':
    sys.path.append('/home/dac/free-sleep/biometrics/')

from data_types import *


# ---------------------------------------------------------------------------------------------------
# region Type definitions




class Measurements(TypedDict):
    combined: List[Measurement]


class ChartLabels(TypedDict, total=False):
    name: str
    start_time: str
    end_time: str
    label: str
    elapsed: float


class PostRuntimeParams(TypedDict):
    r_window_avg: int
    r_min_periods: int


class RuntimeParams(TypedDict):
    window: int
    slide_by: int
    moving_avg_size: int
    hr_std_range: Tuple[int, int]
    hr_percentile: Tuple[int, int]
    signal_percentile: Tuple[float, float]
    window_size: float


class Accuracy(TypedDict):
    window: int
    slide_by: int
    moving_avg_size: int
    hr_std_range: Tuple[int, int]
    percentile: Tuple[int, int]


class ChartInfo(TypedDict, total=False):
    labels: ChartLabels
    runtime_params: RuntimeParams
    accuracy: Accuracy


# endregion
