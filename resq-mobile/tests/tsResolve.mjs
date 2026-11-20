// Cho phép Node (chạy test .ts trực tiếp) resolve import không đuôi giữa các file src,
// giống Metro: `import { x } from './navGeometry'` → './navGeometry.ts'.
// Chỉ dùng cho test; app vẫn được Metro bundle như bình thường.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (relative && !/\.[cm]?[jt]sx?$/.test(specifier) && err?.code === 'ERR_MODULE_NOT_FOUND') {
        for (const ext of ['.ts', '.tsx']) {
          try { return nextResolve(specifier + ext, context); } catch { /* thử đuôi tiếp theo */ }
        }
      }
      throw err;
    }
  },
});
