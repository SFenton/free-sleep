import moment from 'moment-timezone';
import _ from 'lodash';
import logger from '../logger.js';
import settingsDB from '../db/settings.js';
import { connectFranken } from './frankenServer.js';
import { wait } from './promises.js';
import { DeviceStatus, Version } from '../routes/deviceStatus/deviceStatusSchema.js';
import { Side } from '../db/schedulesSchema.js';
import { Gesture, GestureSchema } from '../db/settingsSchema.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { DeepPartial } from 'ts-essentials';
import serverStatus from '../serverStatus.js';
import { publishObservedMqttDeviceStatus } from '../mqtt/mqttService.js';
import { recordInputSignalSnapshot } from './inputSignalMonitor.js';

const DEVICE_STATUS_POLL_MS = 1_000;



export class FrankenMonitor {
  private isRunning: boolean;
  private deviceStatus?: DeviceStatus;

  constructor() {
    this.isRunning = false;
    this.deviceStatus = undefined;
  }

  public async start() {
    if (this.isRunning) {
      logger.warn('FrankenMonitor is already running');
      return;
    }
    this.isRunning = true;
    this.frankenLoop().catch(error => {
      logger.error(error);
      serverStatus.status.frankenMonitor.status = 'failed';
      serverStatus.status.frankenMonitor.message = String(error);
      serverStatus.status.frankenMonitor.timestamp = moment.tz().format();
    });
  }

  public stop() {
    if (!this.isRunning) return;
    logger.debug('Stopping FrankenMonitor loop');
    this.isRunning = false;
  }

  private async processGesture(side: Side, gesture: Gesture) {
    if (!this.deviceStatus) {
      logger.warn('Missing current deviceStatus, skipping gesture...');
      return;
    }
    const behavior = settingsDB.data[side].taps[gesture];
    if (behavior.type === 'temperature') {
      const currentTemperatureTarget = this.deviceStatus[side].targetTemperatureF;
      let newTemperatureTargetF;
      const change = behavior.amount;
      if (behavior.change === 'increment') {
        newTemperatureTargetF = currentTemperatureTarget + change;
      } else {
        newTemperatureTargetF = currentTemperatureTarget + (-1 * change);
      }
      logger.debug(`Processing gesture temperature change for ${side}. ${currentTemperatureTarget} -> ${newTemperatureTargetF}`);
      return await updateDeviceStatus({ [side]: { targetTemperatureF: newTemperatureTargetF } } as DeepPartial<DeviceStatus>);
    } else if (behavior.type) {
      // TODO: Add alarm handling
      logger.warn('Skipping gesture...');
    }
  }

  private async processGesturesForSide(nextDeviceStatus: DeviceStatus, side: Side) {
    try {
      const gestureUpdates: Promise<void>[] = [];
      for (const gesture of GestureSchema.options) {
        if (nextDeviceStatus[side].taps?.[gesture] !== this?.deviceStatus?.[side].taps?.[gesture]) {
          gestureUpdates.push(this.processGesture(side, gesture));
        }
      }
      await Promise.all(gestureUpdates);
    } catch (error) {
      logger.error(error);
    }
  }

  private async processGestures(nextDeviceStatus: DeviceStatus) {
    if (!this.deviceStatus) {
      logger.warn('Missing current deviceStatus, exiting...');
      return;
    }

    await Promise.all([
      this.processGesturesForSide(nextDeviceStatus, 'left'),
      this.processGesturesForSide(nextDeviceStatus, 'right'),
    ]);
  }

  private async publishObservedDeviceStatus(nextDeviceStatus: DeviceStatus) {
    if (_.isEqual(this.deviceStatus, nextDeviceStatus)) return;
    await publishObservedMqttDeviceStatus(nextDeviceStatus);
  }

  private async recordInputSignals(rawDeviceStatusResponse: string) {
    try {
      const events = await recordInputSignalSnapshot(rawDeviceStatusResponse, 'frankenMonitor');
      events.forEach(event => {
        logger.info(
          `Input signal changed | field=${event.field} channel=${event.channel} side=${event.side} ` +
          `value=${event.value} previous=${event.previousValue ?? 'none'}`
        );
      });
    } catch (error) {
      logger.error('Failed to record input signal snapshot');
      logger.error(error);
    }
  }


  private async frankenLoop() {
    const franken = await connectFranken();
    this.deviceStatus = await franken.getDeviceStatus(false);
    let hasGestures = this.deviceStatus.coverVersion !== Version.Pod3;
    const waitTime = DEVICE_STATUS_POLL_MS;
    if (hasGestures) {
      const initialStatus = await franken.getDeviceStatusWithRaw(true);
      this.deviceStatus = initialStatus.deviceStatus;
      await this.recordInputSignals(initialStatus.rawResponse);
      logger.debug(`Gestures supported for ${this.deviceStatus.coverVersion}`);
    } else {
      logger.debug(`Gestures not supported for ${this.deviceStatus.coverVersion}`);
    }
    while (this.isRunning) {
      try {
        while (this.isRunning) {
          hasGestures = this.deviceStatus.coverVersion !== Version.Pod3;
          await wait(waitTime);
          if (!this.isRunning) break;
          const franken = await connectFranken();
          const statusResponse = await franken.getDeviceStatusWithRaw(hasGestures);
          const nextDeviceStatus = statusResponse.deviceStatus;
          await settingsDB.read();
          if (hasGestures) {
            await this.recordInputSignals(statusResponse.rawResponse);
            await this.processGestures(nextDeviceStatus);
          }
          await this.publishObservedDeviceStatus(nextDeviceStatus);
          this.deviceStatus = nextDeviceStatus;
          serverStatus.status.frankenMonitor.status = 'healthy';
          serverStatus.status.frankenMonitor.message = '';
          serverStatus.status.frankenMonitor.timestamp = moment.tz().format();
        }
      } catch (error) {
        serverStatus.status.frankenMonitor.status = 'failed';
        serverStatus.status.frankenMonitor.message = String(error);
        serverStatus.status.frankenMonitor.timestamp = moment.tz().format();
        logger.error(error instanceof Error ? error.message : String(error), 'franken disconnected');
        await wait(waitTime);
      }
    }
    logger.debug('FrankenMonitor loop exited');
  }
}
