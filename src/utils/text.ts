/**
 * 按 **Unicode 码点** 数「字数」。
 *
 * 不能直接用 `String.prototype.length` —— 它数的是 UTF-16 码元：BMP 之外的字符
 * （emoji、部分生僻字、数学符号）会被算成 2 个，于是「👍」显示 2 字。码点数至少
 * 能把这类错消掉；再往上的字素簇（肤色修饰、ZWJ 组合）不做，成本不值。
 *
 * 注意这只是**字符数**，不是 token 数 —— token 只认服务商返回的 usage。
 */
export function countChars(text: string | undefined | null): number {
  if (!text) return 0;
  let n = 0;
  // for...of 按码点迭代，避免 Array.from 为大字符串额外分配一个数组
  for (const _ of text) n += 1;
  return n;
}
