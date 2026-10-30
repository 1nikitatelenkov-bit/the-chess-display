// head-tracker.js
// Head Gesture Detection for Glass Chess (Meta Ray-Ban Display Web Apps).
//
// Detects three head gestures from the device orientation sensor:
//   'nod-yes'  — a quick nod (pitch dips and returns)
//   'shake-no' — a head shake (yaw swings to both sides)
//   'look-up'  — holding the head tilted up
//
// Usage:
//   import { HeadTracker } from './head-tracker.js';
//   const tracker = new HeadTracker();
//   tracker.on('nod-yes', () => { /* ... */ });
//   tracker.on('shake-no', () => { /* ... */ });
//   tracker.on('look-up', () => { /* ... */ });
//   tracker.start(); // returns Promise<boolean>: true if sensor is live
//
// Notes:
// - On iOS, DeviceOrientationEvent.requestPermission() must be called from
//   a user tap; start() handles that and resolves false if not granted.
// - If no orientation sensor exists (e.g. a desktop browser), start()
//   resolves false and the tracker simply never emits.
// - If 'look-up' fires when you look DOWN on your device, flip
//   LOOK_UP_SIGN below from -1 to 1 (sensor frame differs per device).

const LOOK_UP_SIGN = -1;

export class HeadTracker {
  constructor() {
    this.handlers = {};
    this.running = false;
    this.baseBeta = null;      // neutral pitch, calibrated after start
    this.calib = [];
    this.lastYaw = null;       // last raw alpha, for unwrap
    this.yawAccum = 0;         // unwrapped yaw relative to start pose
    this.shakeSide = 0;
    this.shakeSideAt = 0;
    this.nodStart = 0;
    this.nodLockUntil = 0;
    this.upSince = 0;
    this.upArmed = true;
    this.gotData = false;
    this.cool = { 'nod-yes': 0, 'shake-no': 0, 'look-up': 0 };
    this._handler = (e) => this._sample(e);
  }

  on(evt, cb) {
    (this.handlers[evt] || (this.handlers[evt] = [])).push(cb);
    return this;
  }

  _emit(evt) {
    const now = Date.now();
    if (now - (this.cool[evt] || 0) < 900) return;   // per-gesture cooldown
    this.cool[evt] = now;
    (this.handlers[evt] || []).slice().forEach((cb) => { try { cb(); } catch (err) {} });
  }

  start() {
    if (this.running) return Promise.resolve(true);
    if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve(false);
    const add = () => {
      window.addEventListener('deviceorientation', this._handler, true);
      this.running = true;
      return true;
    };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission()
        .then((r) => (r === 'granted' ? add() : false))
        .catch(() => false);
    }
    return Promise.resolve(add());
  }

  stop() {
    if (!this.running) return;
    window.removeEventListener('deviceorientation', this._handler, true);
    this.running = false;
    this.baseBeta = null;
    this.calib = [];
    this.lastYaw = null;
    this.yawAccum = 0;
  }

  _sample(e) {
    if (e.beta === null || e.beta === undefined) return;
    this.gotData = true;
    const now = Date.now();

    // Calibrate the neutral pose from the first ~12 samples.
    if (this.baseBeta === null) {
      this.calib.push(e.beta);
      if (this.calib.length >= 12) {
        let s = 0;
        this.calib.forEach((b) => { s += b; });
        this.baseBeta = s / this.calib.length;
        this.calib = [];
      }
      return;
    }

    const pitch = e.beta - this.baseBeta;

    // nod-yes: pitch excursion of >=16deg that returns near neutral
    // within 1.5s (either direction counts as a nod).
    const ap = Math.abs(pitch);
    if (this.nodStart === 0 && ap >= 16 && now >= this.nodLockUntil) {
      this.nodStart = now;
    } else if (this.nodStart !== 0) {
      if (ap <= 6) {
        if (now - this.nodStart <= 1500) this._emit('nod-yes');
        this.nodStart = 0;
      } else if (now - this.nodStart > 1500) {
        this.nodStart = 0;
      }
    }

    // look-up: head held up (LOOK_UP_SIGN * pitch >= 20) for >=450ms.
    if (LOOK_UP_SIGN * pitch >= 20) {
      if (this.upSince === 0) this.upSince = now;
      else if (this.upArmed && now - this.upSince >= 450) {
        this._emit('look-up');
        this.upArmed = false;
        this.nodStart = 0;   // a look-up is not also a nod
        this.nodLockUntil = now + 1200;
      }
    } else {
      this.upSince = 0;
      if (LOOK_UP_SIGN * pitch < 8) this.upArmed = true;
    }

    // shake-no: yaw swings >=14deg to one side, then to the other,
    // within 1.4s. Yaw is unwrapped alpha with a slow recenter to
    // absorb compass drift.
    if (e.alpha !== null && e.alpha !== undefined) {
      if (this.lastYaw === null) this.lastYaw = e.alpha;
      let d = e.alpha - this.lastYaw;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      this.yawAccum += d;
      this.lastYaw = e.alpha;
      const yaw = this.yawAccum;
      const side = yaw >= 14 ? 1 : (yaw <= -14 ? -1 : 0);
      if (side !== 0) {
        if (this.shakeSide === 0) {
          this.shakeSide = side; this.shakeSideAt = now;
        } else if (side !== this.shakeSide) {
          if (now - this.shakeSideAt <= 1400) this._emit('shake-no');
          this.shakeSide = side; this.shakeSideAt = now;
        } else if (now - this.shakeSideAt > 1400) {
          this.shakeSideAt = now;
        }
      }
      this.yawAccum *= 0.995;
    }
  }
}
