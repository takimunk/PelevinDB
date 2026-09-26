export const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
