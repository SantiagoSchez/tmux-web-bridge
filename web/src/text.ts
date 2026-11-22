/** Lower case and without accents, to search: «camión» is found by «camion». */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
