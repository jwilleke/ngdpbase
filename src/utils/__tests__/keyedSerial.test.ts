/**
 * KeyedSerial — one task at a time per key (#2015).
 */
import { KeyedSerial } from '../keyedSerial';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('KeyedSerial (#2015)', () => {
  test('tasks on one key run one after another, in the order queued', async () => {
    const serial = new KeyedSerial();
    const log: string[] = [];
    let running = 0;
    const task = (name: string) => async () => {
      running++;
      expect(running).toBe(1);
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      running--;
      return name;
    };
    const results = await Promise.all(['a', 'b', 'c'].map((n) => serial.run('k', task(n))));
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  test('different keys run side by side', async () => {
    const serial = new KeyedSerial();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const first = serial.run('one', () => held);
    let otherRan = false;
    await serial.run('two', async () => { otherRan = true; });
    expect(otherRan).toBe(true);
    release();
    await first;
  });

  test('a failed task fails its own caller only; the next task on the key still runs', async () => {
    const serial = new KeyedSerial();
    const failing = serial.run('k', async () => { throw new Error('disk full'); });
    const next = serial.run('k', async () => 'ran');
    await expect(failing).rejects.toThrow('disk full');
    await expect(next).resolves.toBe('ran');
  });

  test('settled waits for every queued task, failed ones included', async () => {
    const serial = new KeyedSerial();
    let done = 0;
    void serial.run('a', async () => { await tick(); done++; });
    serial.run('b', async () => { await tick(); done++; throw new Error('x'); }).catch(() => {});
    await serial.settled();
    expect(done).toBe(2);
  });
});
