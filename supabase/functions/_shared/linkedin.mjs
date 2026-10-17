export function linkedinSearchUrl({keyword,geography,workTypes=[],experienceLevels=['1','2','3'],contractTypes=[],ageSeconds=604800}) {
  if(!keyword?.trim() || !/^\d+$/.test(geography?.geoId||'')) throw new Error('Explicit LinkedIn geography required');
  const url=new URL('https://www.linkedin.com/jobs/search/');
  url.searchParams.set('keywords',keyword);
  url.searchParams.set('geoId',geography.geoId);
  url.searchParams.set('location',geography.label);
  if(workTypes.length) url.searchParams.set('f_WT',workTypes.join(','));
  if(experienceLevels.length) url.searchParams.set('f_E',experienceLevels.join(','));
  if(contractTypes.length) url.searchParams.set('f_JT',contractTypes.join(','));
  url.searchParams.set('f_TPR',`r${ageSeconds}`);
  return url.toString();
}

export function linkedinUrlInput(urls,rowsPerUrl=10) {
  if(!urls.length || urls.length>4 || !Number.isInteger(rowsPerUrl) || rowsPerUrl<1 || rowsPerUrl>10) throw new Error('Bounded LinkedIn URLs required');
  return {startUrls:urls.map(url=>({url})),maxRowsPerUrl:rowsPerUrl,rows:rowsPerUrl,companyProfile:false,enrichCompany:false};
}

export function verifyLinkedinResults(records,input,geography) {
  const expected=new Set(input.startUrls.map(x=>x.url));
  if(records.some(r=>!expected.has(r.scrapingInfo?.inputUrl))) throw new Error('linkedin_provenance_mismatch');
  const markers=geography.quality_markers||[];
  if(records.length && markers.length && !records.some(r=>markers.some(m=>String(r.location||'').toLowerCase().includes(m.toLowerCase()))))
    throw new Error('linkedin_location_mismatch');
  return {location_checked:true,expected_geo_id:geography.geo_id,provenance_checked:true};
}
