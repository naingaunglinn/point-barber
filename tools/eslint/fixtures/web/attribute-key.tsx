// Must pass: the attribute text comes from a language key; an empty alt marks a decorative image.
declare const t: (key: string) => string;
export function Search() {
  return (
    <>
      <input placeholder={t('common.search.placeholder')} />
      <img alt="" src="/photo.webp" />
    </>
  );
}
