import JSZip from 'jszip';
import { normalize, type Book } from './model';
const MAX_TEXT = 5_000_000;
function parseXml(raw: string) {
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Не удалось прочитать XML книги. Проверьте файл.');
  return doc;
}
const nodes = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
function plain(root: Element | Document): string {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll('script,style,nav,binary').forEach(n => n.remove());
  copy.querySelectorAll('p,div,h1,h2,h3,h4,li,br,section').forEach(n => n.append('\n\n'));
  return copy.textContent ?? '';
}
function decoded(data: ArrayBuffer): string {
  const head = new TextDecoder().decode(data.slice(0, 200));
  const encoding = head.match(/encoding=["']([^"']+)/i)?.[1] ?? 'utf-8';
  try { return new TextDecoder(encoding).decode(data); } catch { throw new Error('Кодировка файла не поддерживается. Сохраните его в UTF-8.'); }
}
export async function importBook(file: File): Promise<Book> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Максимальный размер файла — 20 МБ.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  let title = file.name.replace(/\.[^.]+$/, ''), author = 'Автор не указан', text = '';
  const data = await file.arrayBuffer();
  if (ext === 'txt' || ext === 'md') text = decoded(data);
  else if (ext === 'fb2') {
    const doc = parseXml(decoded(data));
    title = nodes(doc, 'book-title')[0]?.textContent || title;
    const person = nodes(doc, 'author')[0];
    if (person) author = ['first-name', 'middle-name', 'last-name'].map(k => nodes(person, k)[0]?.textContent).filter(Boolean).join(' ') || author;
    text = nodes(doc, 'body').filter(n => n.getAttribute('name') !== 'notes').map(plain).join('\n\n');
  } else if (ext === 'epub') {
    const zip = await JSZip.loadAsync(data);
    let expanded = 0;
    async function read(path: string) {
      const entry = zip.file(path);
      if (!entry) throw new Error(`В EPUB отсутствует файл: ${path}`);
      // Bound expansion before decompressing untrusted archive entries.
      const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
      if (typeof declared !== 'number' || declared > 10_000_000 || expanded + declared > 30_000_000) throw new Error('Распакованная книга слишком большая.');
      expanded += declared;
      return await entry.async('string');
    }
    const container = parseXml(await read('META-INF/container.xml'));
    const opfPath = nodes(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new Error('В EPUB не найдено оглавление.');
    const opf = parseXml(await read(opfPath));
    title = nodes(opf, 'title')[0]?.textContent || title;
    author = nodes(opf, 'creator')[0]?.textContent || author;
    const manifest = new Map(nodes(opf, 'item').map(n => [n.getAttribute('id'), n.getAttribute('href')]));
    const chunks: string[] = [];
    for (const ref of nodes(opf, 'itemref')) {
      if (ref.getAttribute('linear') === 'no') continue;
      const href = manifest.get(ref.getAttribute('idref'));
      if (!href) throw new Error('Повреждён порядок глав EPUB.');
      const url = new URL(href, `https://epub.local/${opfPath}`);
      if (url.origin !== 'https://epub.local') throw new Error('Внешние главы EPUB не поддерживаются.');
      const raw = await read(decodeURIComponent(url.pathname.slice(1)));
      const html = new DOMParser().parseFromString(raw, 'text/html');
      chunks.push(plain(html.body));
    }
    text = chunks.join('\n\n');
  } else throw new Error('Поддерживаются EPUB, FB2, TXT и Markdown.');
  text = normalize(text);
  if (!text) throw new Error('В книге не найден текст. Возможно, файл защищён или содержит только изображения.');
  if (text.length > MAX_TEXT) throw new Error('Для прототипа доступно до 5 млн символов.');
  return { title: title.trim(), author: author.trim(), text, format: ext!.toUpperCase() };
}
