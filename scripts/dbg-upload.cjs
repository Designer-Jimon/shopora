const BASE = process.env.API_BASE || 'http://localhost:3200';
const email = 'onboard-test@shopora.dev';
async function main(){
  const r = await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'OnboardPass123!'})});
  const c = r.headers.get('set-cookie').match(/shopora_session=([^;]*)/)[1];
  const cookie = `shopora_session=${c}`;
  // upload a banner
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,252,15,4,0,9,251,3,253,197,0,200,0,0,0,0,73,69,78,68,174,66,96,130]);
  const fd = new FormData();
  fd.append('file', new Blob([png], {type:'image/png'}), 'banner.png');
  fd.append('kind','banner');
  const up = await fetch(BASE+'/api/businesses/upload',{method:'POST',headers:{cookie},body:fd});
  const upData = await up.json();
  console.log('upload status', up.status, 'url:', upData.url);
  // fetch the asset
  const asset = await fetch(BASE+upData.url);
  console.log('asset fetch status', asset.status, 'content-type:', asset.headers.get('content-type'));
  // print the body (may be error)
  const txt = await asset.text();
  console.log('body:', txt.slice(0,200));
}
main().catch(e=>console.error(e));
