export function filterMistakes(rows, misses, kind, order) {
  const alphabetical = (a,b) => a.word.localeCompare(b.word,'en');
  const recent = (a,b) => misses.get(b.word).latest - misses.get(a.word).latest;
  const count = (a,b) => misses.get(b.word).count - misses.get(a.word).count;
  const compare = ({
    'az':alphabetical,'za':(a,b)=>alphabetical(b,a),
    'most':(a,b)=>count(a,b)||recent(a,b)||alphabetical(a,b),
    'fewest':(a,b)=>count(b,a)||recent(a,b)||alphabetical(a,b),
    'newest':(a,b)=>recent(a,b)||alphabetical(a,b),
    'oldest':(a,b)=>recent(b,a)||alphabetical(a,b)
  })[order] || alphabetical;
  return rows.filter(word => kind === 'all' || (kind === 'phrase' ? Boolean(word.phrase) :
    !word.phrase && Boolean(word.pos?.split('/').includes(kind)))).sort(compare);
}
