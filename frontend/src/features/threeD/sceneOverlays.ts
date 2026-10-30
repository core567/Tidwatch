/** Supplied by the host only. These are display extents, not inferred pollution/flood propagation. */
export interface InfluenceRange {
  id: string;
  startT: number;
  endT: number;
  source: 'HOST_CONFIRMED' | 'SIMULATED';
  label?: string;
}
export function normalizeInfluenceRanges(input?: readonly InfluenceRange[]): InfluenceRange[] {
  if(!Array.isArray(input))return [];
  const seen=new Set<string>();
  return input.filter(range=>{
    if(!range || typeof range.id!=='string' || !range.id || seen.has(range.id) ||
      !Number.isFinite(range.startT)||!Number.isFinite(range.endT)||range.startT<0||range.endT>1||range.startT>=range.endT||
      !['HOST_CONFIRMED','SIMULATED'].includes(range.source))return false;
    seen.add(range.id);return true;
  }).map(range=>({...range}));
}
