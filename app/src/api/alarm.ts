import axios from './api';
import type { AlarmJob } from '../../../server/src/db/schedulesSchema.ts';


export const postAlarm = (alarmJob: AlarmJob) => {
  return axios.post('/alarm', alarmJob);
};
