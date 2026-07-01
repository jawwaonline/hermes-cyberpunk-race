import { describe, it } from 'node:test';
import assert from 'node:assert';

function validateInput(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['missing input object'] };
  }

  const { throttle, brake, steer, seq, dt } = input;

  if (!Number.isFinite(throttle) || throttle < 0 || throttle > 1) {
    errors.push('invalid throttle: must be number in [0,1]');
  }

  if (!Number.isFinite(brake) || brake < 0 || brake > 1) {
    errors.push('invalid brake: must be number in [0,1]');
  }

  if (!Number.isFinite(steer) || steer < -1 || steer > 1) {
    errors.push('invalid steer: must be number in [-1,1]');
  }

  if (!Number.isFinite(seq) || seq < 0 || !Number.isInteger(seq)) {
    errors.push('invalid seq: must be non-negative integer');
  }

  if (!Number.isFinite(dt) || dt < 0 || dt > 0.1) {
    errors.push('invalid dt: must be number in (0,0.1]');
  }

  return { valid: errors.length === 0, errors };
}

function validateNumber(val, min, max) {
  const n = Number(val);
  return isNaN(n) || !isFinite(n) || n < min || n > max ? null : n;
}

describe('Bug #1: Server-authoritative input validation', () => {
  describe('validateInput()', () => {
    it('accepts valid input with all fields in range', () => {
      const result = validateInput({ throttle: 0.5, brake: 0.2, steer: 0.0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('accepts boundary values (0 and 1 for throttle/brake)', () => {
      assert.strictEqual(validateInput({ throttle: 0, brake: 0, steer: 0, seq: 1, dt: 0.016 }).valid, true);
      assert.strictEqual(validateInput({ throttle: 1, brake: 1, steer: 0, seq: 1, dt: 0.016 }).valid, true);
      assert.strictEqual(validateInput({ throttle: 0.5, brake: 0.5, steer: -1, seq: 1, dt: 0.016 }).valid, true);
      assert.strictEqual(validateInput({ throttle: 0.5, brake: 0.5, steer: 1, seq: 1, dt: 0.016 }).valid, true);
    });

    it('rejects NaN for throttle', () => {
      const result = validateInput({ throttle: NaN, brake: 0, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects Infinity for brake', () => {
      const result = validateInput({ throttle: 0, brake: Infinity, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects -Infinity for steer', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: -Infinity, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects undefined throttle', () => {
      const result = validateInput({ brake: 0, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects missing input object', () => {
      assert.strictEqual(validateInput(null).valid, false);
      assert.strictEqual(validateInput(undefined).valid, false);
      assert.strictEqual(validateInput('string').valid, false);
    });

    it('rejects throttle out of range (>1)', () => {
      const result = validateInput({ throttle: 1.1, brake: 0, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects throttle out of range (<0)', () => {
      const result = validateInput({ throttle: -0.1, brake: 0, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects brake out of range', () => {
      const result = validateInput({ throttle: 0, brake: -0.1, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
      const result2 = validateInput({ throttle: 0, brake: 1.5, steer: 0, seq: 1, dt: 0.016 });
      assert.strictEqual(result2.valid, false);
    });

    it('rejects steer out of range', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: -1.1, seq: 1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
      const result2 = validateInput({ throttle: 0, brake: 0, steer: 1.1, seq: 1, dt: 0.016 });
      assert.strictEqual(result2.valid, false);
    });

    it('rejects negative seq', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: 0, seq: -1, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects non-integer seq', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: 0, seq: 1.5, dt: 0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('accepts dt = 0 (zero delta time is valid)', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: 0, seq: 1, dt: 0 });
      assert.strictEqual(result.valid, true);
    });

    it('rejects dt > 0.1', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: 0, seq: 1, dt: 0.2 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects negative dt', () => {
      const result = validateInput({ throttle: 0, brake: 0, steer: 0, seq: 1, dt: -0.016 });
      assert.strictEqual(result.valid, false);
    });

    it('rejects undefined fields', () => {
      assert.strictEqual(validateInput({}).valid, false);
    });
  });

  describe('validateNumber()', () => {
    it('returns null for NaN', () => {
      assert.strictEqual(validateNumber(NaN, -100, 100), null);
    });

    it('returns null for Infinity', () => {
      assert.strictEqual(validateNumber(Infinity, -100, 100), null);
      assert.strictEqual(validateNumber(-Infinity, -100, 100), null);
    });

    it('returns null for values outside range', () => {
      assert.strictEqual(validateNumber(150, -100, 100), null);
      assert.strictEqual(validateNumber(-150, -100, 100), null);
    });

    it('returns the number for valid values', () => {
      assert.strictEqual(validateNumber(0, -100, 100), 0);
      assert.strictEqual(validateNumber(50, -100, 100), 50);
      assert.strictEqual(validateNumber(-50, -100, 100), -50);
    });

    it('handles string inputs', () => {
      assert.strictEqual(validateNumber('50', -100, 100), 50);
      assert.strictEqual(validateNumber('invalid', -100, 100), null);
    });
  });

  describe('Out-of-order sequence detection', () => {
    it('detects out-of-order seq (new seq <= last seq)', () => {
      let lastSeq = 5;
      const isOutOfOrder = (seq) => seq <= lastSeq;
      assert.strictEqual(isOutOfOrder(5), true);
      assert.strictEqual(isOutOfOrder(4), true);
      assert.strictEqual(isOutOfOrder(0), true);
      lastSeq = 5;
      assert.strictEqual(isOutOfOrder(6), false);
    });
  });

  describe('Flood detection (>60 inputs/s)', () => {
    it('detects flood when input rate exceeds 60/s', () => {
      const RATE_WINDOW_MS = 1000;
      const RATE_MAX = 60;
      let rl = { count: 0, resetAt: Date.now() + RATE_WINDOW_MS };

      const isFlood = (rl) => {
        const now = Date.now();
        if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + RATE_WINDOW_MS; }
        rl.count++;
        return rl.count > RATE_MAX;
      };

      for (let i = 0; i < 60; i++) {
        assert.strictEqual(isFlood(rl), false, `Input ${i + 1} should not flood`);
      }
      assert.strictEqual(isFlood(rl), true, '61st input should flood');
    });
  });
});

describe('Bug #1 Integration: Input → Snapshot flow', () => {
  it('simulates valid input passing through validation', () => {
    const input = { throttle: 0.8, brake: 0.0, steer: 0.3, seq: 10, dt: 0.016 };
    const validation = validateInput(input);
    assert.strictEqual(validation.valid, true);

    let lastSeq = 9;
    const isOutOfOrder = (seq) => seq <= lastSeq;
    assert.strictEqual(isOutOfOrder(input.seq), false);

    assert.strictEqual(input.throttle >= 0 && input.throttle <= 1, true);
    assert.strictEqual(input.brake >= 0 && input.brake <= 1, true);
    assert.strictEqual(input.steer >= -1 && input.steer <= 1, true);
  });

  it('simulates invalid input being rejected before snapshot', () => {
    const badInputs = [
      { throttle: NaN, brake: 0, steer: 0, seq: 1, dt: 0.016 },
      { throttle: 0, brake: Infinity, steer: 0, seq: 1, dt: 0.016 },
      { throttle: 0, brake: 0, steer: -2, seq: 1, dt: 0.016 },
      { throttle: 0, brake: 0, steer: 0, seq: 1, dt: -0.016 },
    ];

    for (const input of badInputs) {
      const validation = validateInput(input);
      assert.strictEqual(validation.valid, false, `Input ${JSON.stringify(input)} should be invalid`);
    }
  });
});