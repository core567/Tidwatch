// 最小化 Node 内置模块声明：测试仅用 node:test / node:assert/strict，
// 不引入 @types/node（小程序运行时与 Node 无关，测试经 tsc 编译到 dist-test 后由 Node 24 执行）。
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  interface AssertFn {
    (actual: unknown, expected: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    match(actual: unknown, re: RegExp, message?: string): void;
  }
  const assert: AssertFn;
  export = assert;
}
