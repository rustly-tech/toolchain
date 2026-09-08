/**
 * A WASI preview 1 runtime for the browser.
 *
 * # What this is
 *
 * Enough of `wasi_snapshot_preview1` to run a `wasm32-wasip1` Rust program that
 * reads stdin, writes stdout and stderr, and exits. That is exactly the shape of
 * a Rustly Trial submission, and nothing more.
 *
 * # What it deliberately is not
 *
 * There is **no filesystem, no network, no environment, and no clock beyond a
 * coarse monotonic reading**. Not "not yet" — not at all. Every unimplemented
 * call returns `ENOSYS` rather than a plausible answer, because a runtime that
 * silently pretends to open a file produces a program that works here and fails
 * everywhere else, which is worse than one that fails immediately.
 *
 * This runs a program the *learner* wrote, in the learner's own browser, so it
 * is not a security boundary in the way the judge's sandbox is: there is nothing
 * here they could reach that they do not already own. Authoritative judging
 * happens server-side, in Wasmtime, against hidden tests.
 *
 * # Status: IMPLEMENTED
 *
 * Tested against genuinely `rustc`-compiled `wasm32-wasip1` binaries.
 */

/** WASI errno values this runtime uses. */
export const Errno = {
  SUCCESS: 0,
  BADF: 8,
  INVAL: 28,
  NOSYS: 52,
  PIPE: 64,
} as const;

/** Standard file descriptors. */
const FD = { STDIN: 0, STDOUT: 1, STDERR: 2 } as const;

/** Bounds applied to a running program. */
export interface Limits {
  /** Maximum combined stdout + stderr, in bytes. */
  outputBytes: number;
  /** Maximum observed linear memory, in bytes. */
  memoryBytes: number;
  /** Wall-clock budget checked at host calls and when the program returns. */
  wallMs: number;
}

/** Conservative defaults, matching the judge's shape if not its exact values. */
export const DEFAULT_LIMITS: Limits = {
  outputBytes: 256 * 1024,
  memoryBytes: 64 * 1024 * 1024,
  wallMs: 5_000,
};

/** Why a program stopped. */
export type Termination =
  | { kind: 'exited'; code: number }
  | { kind: 'trapped'; detail: string }
  | { kind: 'limit'; limit: 'output' | 'memory' | 'wall' };

/** What running a program produced. */
export interface RunOutcome {
  termination: Termination;
  stdout: string;
  stderr: string;
  wallMs: number;
  /** True when output was truncated because the budget ran out. */
  outputTruncated: boolean;
}

/** A guest asked to exit. Thrown to unwind out of the guest call. */
class ProcExit extends Error {
  constructor(readonly code: number) {
    super(`proc_exit(${String(code)})`);
    this.name = 'ProcExit';
  }
}

/** A guest exceeded a bound. Thrown to unwind out of the guest call. */
class LimitExceeded extends Error {
  constructor(readonly limit: 'output' | 'memory' | 'wall') {
    super(`limit exceeded: ${limit}`);
    this.name = 'LimitExceeded';
  }
}

/** Options for {@link run}. */
export interface RunOptions {
  /** Bytes the program reads from stdin. */
  stdin?: string;
  /** Command-line arguments. `argv[0]` is supplied automatically. */
  args?: string[];
  /** Bounds. */
  limits?: Partial<Limits>;
}

/**
 * Instantiate and run a precompiled `wasm32-wasip1` module.
 *
 * Never throws for anything the guest did: a trap, a non-zero exit, and an
 * exceeded bound are all outcomes. It throws only if the module itself cannot be
 * instantiated, which is our problem rather than the learner's.
 */
export async function run(module: BufferSource, options: RunOptions = {}): Promise<RunOutcome> {
  const limits: Limits = { ...DEFAULT_LIMITS, ...options.limits };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stdinBytes = encoder.encode(options.stdin ?? '');
  let stdinOffset = 0;

  const stdout: Uint8Array[] = [];
  const stderr: Uint8Array[] = [];
  let written = 0;
  let outputTruncated = false;

  const started = performance.now();
  let memory: WebAssembly.Memory | null = null;

  const view = () => {
    if (!memory) throw new Error('the guest has no exported memory');
    return new DataView(memory.buffer);
  };
  const bytes = () => {
    if (!memory) throw new Error('the guest has no exported memory');
    return new Uint8Array(memory.buffer);
  };

  /** Charge output against the budget, truncating rather than growing forever. */
  const record = (sink: Uint8Array[], chunk: Uint8Array): void => {
    const room = limits.outputBytes - written;
    if (room <= 0) {
      outputTruncated = true;
      throw new LimitExceeded('output');
    }
    if (chunk.length > room) {
      sink.push(chunk.subarray(0, room));
      written += room;
      outputTruncated = true;
      throw new LimitExceeded('output');
    }
    sink.push(chunk);
    written += chunk.length;
  };

  /** Wall clock is checked on every syscall, which is often enough in practice. */
  const checkRuntimeLimits = (): void => {
    if (performance.now() - started > limits.wallMs) throw new LimitExceeded('wall');
    if (memory && memory.buffer.byteLength > limits.memoryBytes) {
      throw new LimitExceeded('memory');
    }
  };

  const argv = ['submission', ...(options.args ?? [])].map((a) => encoder.encode(`${a}\0`));

  const wasi = {
    // ---- output -----------------------------------------------------------
    fd_write(fd: number, iovs: number, iovsLen: number, written_ptr: number): number {
      checkRuntimeLimits();
      if (fd !== FD.STDOUT && fd !== FD.STDERR) return Errno.BADF;

      const data = view();
      let total = 0;
      for (let i = 0; i < iovsLen; i += 1) {
        const base = data.getUint32(iovs + i * 8, true);
        const length = data.getUint32(iovs + i * 8 + 4, true);
        record(fd === FD.STDOUT ? stdout : stderr, bytes().slice(base, base + length));
        total += length;
      }
      data.setUint32(written_ptr, total, true);
      return Errno.SUCCESS;
    },

    // ---- input ------------------------------------------------------------
    fd_read(fd: number, iovs: number, iovsLen: number, read_ptr: number): number {
      checkRuntimeLimits();
      if (fd !== FD.STDIN) return Errno.BADF;

      const data = view();
      let total = 0;
      for (let i = 0; i < iovsLen; i += 1) {
        const base = data.getUint32(iovs + i * 8, true);
        const length = data.getUint32(iovs + i * 8 + 4, true);
        const slice = stdinBytes.subarray(stdinOffset, stdinOffset + length);
        bytes().set(slice, base);
        stdinOffset += slice.length;
        total += slice.length;
        if (slice.length < length) break; // stdin is exhausted
      }
      data.setUint32(read_ptr, total, true);
      return Errno.SUCCESS;
    },

    // ---- process ----------------------------------------------------------
    proc_exit(code: number): never {
      throw new ProcExit(code);
    },

    // ---- arguments --------------------------------------------------------
    args_sizes_get(count_ptr: number, size_ptr: number): number {
      const data = view();
      data.setUint32(count_ptr, argv.length, true);
      data.setUint32(
        size_ptr,
        argv.reduce((sum, a) => sum + a.length, 0),
        true,
      );
      return Errno.SUCCESS;
    },
    args_get(argv_ptr: number, buf_ptr: number): number {
      const data = view();
      let offset = buf_ptr;
      for (const [i, argument] of argv.entries()) {
        data.setUint32(argv_ptr + i * 4, offset, true);
        bytes().set(argument, offset);
        offset += argument.length;
      }
      return Errno.SUCCESS;
    },

    // ---- environment: deliberately empty ----------------------------------
    //
    // Not "not yet". A program that reads an environment variable here and gets
    // one would behave differently in the judge, which is the worst kind of
    // difference: invisible until it costs someone a verdict.
    environ_sizes_get(count_ptr: number, size_ptr: number): number {
      const data = view();
      data.setUint32(count_ptr, 0, true);
      data.setUint32(size_ptr, 0, true);
      return Errno.SUCCESS;
    },
    environ_get(): number {
      return Errno.SUCCESS;
    },

    // ---- clocks -----------------------------------------------------------
    clock_time_get(_id: number, _precision: bigint, time_ptr: number): number {
      checkRuntimeLimits();
      // Milliseconds as nanoseconds. Coarse on purpose: a high-resolution timer
      // is a side channel, and nothing a learner writes needs one.
      view().setBigUint64(time_ptr, BigInt(Math.round(performance.now())) * 1_000_000n, true);
      return Errno.SUCCESS;
    },

    random_get(buf: number, len: number): number {
      crypto.getRandomValues(bytes().subarray(buf, buf + len));
      return Errno.SUCCESS;
    },

    // ---- descriptors: only the three standard ones exist -------------------
    fd_close(fd: number): number {
      return fd <= FD.STDERR ? Errno.SUCCESS : Errno.BADF;
    },
    fd_fdstat_get(fd: number, stat_ptr: number): number {
      if (fd > FD.STDERR) return Errno.BADF;
      const data = view();
      data.setUint8(stat_ptr, 2); // character device
      data.setUint16(stat_ptr + 2, 0, true);
      data.setBigUint64(stat_ptr + 8, 0n, true);
      data.setBigUint64(stat_ptr + 16, 0n, true);
      return Errno.SUCCESS;
    },
    fd_seek(): number {
      return Errno.BADF; // stdio is not seekable
    },
    fd_prestat_get(): number {
      // No preopened directories, so there is no filesystem to reach.
      return Errno.BADF;
    },
    fd_prestat_dir_name(): number {
      return Errno.BADF;
    },
    sched_yield(): number {
      checkRuntimeLimits();
      return Errno.SUCCESS;
    },
    poll_oneoff(): number {
      return Errno.NOSYS;
    },
  };

  // Everything else returns ENOSYS. A plausible fake answer would produce a
  // program that works here and fails in the judge.
  const unimplemented = [
    'path_open',
    'path_create_directory',
    'path_remove_directory',
    'path_unlink_file',
    'path_filestat_get',
    'path_rename',
    'path_symlink',
    'path_readlink',
    'path_link',
    'fd_filestat_get',
    'fd_filestat_set_size',
    'fd_readdir',
    'fd_sync',
    'fd_datasync',
    'fd_pread',
    'fd_pwrite',
    'fd_advise',
    'fd_allocate',
    'fd_renumber',
    'fd_tell',
    'sock_accept',
    'sock_recv',
    'sock_send',
    'sock_shutdown',
    'proc_raise',
    'clock_res_get',
  ];
  const imports: Record<string, unknown> = { ...wasi };
  for (const name of unimplemented) {
    if (!(name in imports)) imports[name] = () => Errno.NOSYS;
  }

  let instance: WebAssembly.Instance;
  try {
    const compiled = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: imports as WebAssembly.ModuleImports,
    });
    instance = 'instance' in compiled ? compiled.instance : compiled;
  } catch (error) {
    // The module could not be instantiated at all: a missing import, or bytes
    // that are not a module. That is our problem, not the learner's.
    throw new Error(`this module cannot run here: ${String(error)}`, { cause: error });
  }

  const exports = instance.exports as Record<string, unknown>;
  memory = exports['memory'] as WebAssembly.Memory | null;
  if (!memory) throw new Error('the module does not export its memory');
  if (memory.buffer.byteLength > limits.memoryBytes) {
    return finish({ kind: 'limit', limit: 'memory' });
  }

  const start = exports['_start'];
  if (typeof start !== 'function') {
    throw new Error('the module has no WASI `_start` export');
  }

  let termination: Termination;
  try {
    (start as () => void)();
    checkRuntimeLimits();
    termination = { kind: 'exited', code: 0 };
  } catch (error) {
    if (error instanceof ProcExit) {
      try {
        checkRuntimeLimits();
        termination = { kind: 'exited', code: error.code };
      } catch (limitError) {
        if (!(limitError instanceof LimitExceeded)) throw limitError;
        termination = { kind: 'limit', limit: limitError.limit };
      }
    } else if (error instanceof LimitExceeded) {
      termination = { kind: 'limit', limit: error.limit };
    } else if (error instanceof WebAssembly.RuntimeError) {
      termination = { kind: 'trapped', detail: error.message };
    } else {
      termination = { kind: 'trapped', detail: String(error) };
    }
  }

  return finish(termination);

  function finish(termination: Termination): RunOutcome {
    const join = (chunks: Uint8Array[]): string => {
      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return decoder.decode(merged);
    };
    return {
      termination,
      stdout: join(stdout),
      stderr: join(stderr),
      wallMs: Math.round(performance.now() - started),
      outputTruncated,
    };
  }
}
