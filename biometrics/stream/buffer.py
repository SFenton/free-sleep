from collections import deque
from itertools import islice
from data_types import *
from typing import Deque
import numpy as np


class Buffer:
    def __init__(
            self,
            heart_rate_window_seconds,
            breath_rate_window_seconds,
            hrv_window_seconds,
    ):
        self.heart_rate_window_seconds = heart_rate_window_seconds
        self.heart_rate_buffer = deque([], maxlen=self.heart_rate_window_seconds)

        self.breath_rate_window_seconds = breath_rate_window_seconds
        self.hrv_window_seconds = hrv_window_seconds
        self.buffer_size = max(breath_rate_window_seconds, hrv_window_seconds)

        self.piezo_buffer: Deque[PiezoDualData] = deque([], maxlen=self.buffer_size)


    def append(self, piezo_record: PiezoDualData):
        self.heart_rate_buffer.append(piezo_record)
        self.piezo_buffer.append(piezo_record)

    def get_heart_rate_signal(self, side: Side, sensor_number: Literal[1,2]) -> np.ndarray:
        return np.concatenate([entry[f"{side}{sensor_number}"] for entry in self.heart_rate_buffer])


    def get_signal(self, side: Side, length: int) -> np.ndarray:
        return np.concatenate([
            entry[f'{side}1'] for entry in islice(self.piezo_buffer, len(self.piezo_buffer) - length, len(self.piezo_buffer))
        ])
