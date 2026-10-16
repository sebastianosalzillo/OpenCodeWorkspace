// Verifica che una risposta appartenga al prompt pendente, non alla sessione precedente.
// In assenza di correlazione verificabile, mantenere il job irrisolto.
export function matchingReply(messages, {text, after=null, baseline=null}={}){
  if(!Array.isArray(messages)||typeof text!=='string'||!text)return null;
  let userIndex=-1;
  for(let i=messages.length-1;i>=0;i--){
    const m=messages[i];
    if(m?.info?.role!=='user')continue;
    const body=(Array.isArray(m.parts)?m.parts:[]).filter(p=>p.type==='text').map(p=>p.text||'').join('\n');
    if(body!==text)continue;
    // Tolleranza limitata per differenze d'orologio tra il server e il PC.
    const created=Number(m.info?.time?.created);
    if(Number.isFinite(after)&&after>0 && (!created || created<after-90_000))return null;
    userIndex=i;break;
  }
  if(userIndex<0)return null;
  const userId=messages[userIndex].info?.id;
  for(let i=userIndex+1;i<messages.length;i++){
    const m=messages[i];
    if(m?.info?.role==='user')break; // non attribuire a questo job risposte a prompt successivi
    if(m?.info?.role!=='assistant'||!m.info?.id||!m.info?.time?.completed)continue;
    if(baseline?.has(m.info.id))continue;
    if(m.info.parentID && userId && m.info.parentID!==userId)continue;
    return m;
  }
  return null;
}
