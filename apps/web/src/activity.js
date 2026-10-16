// Riduce i payload OpenCode a un'anteprima leggibile, senza renderizzare HTML.
// La chat mostra comandi e modifiche soltanto per le sessioni dell'utente.
const short=(value,max=1500)=>typeof value==='string'?value.slice(0,max):'';
export function describePart(part){
  const state=part?.state||{}, input=state.input||{}, meta=state.metadata||{};
  if(part?.type==='patch'){
    const files=Array.isArray(part.files)?part.files.filter(x=>typeof x==='string').slice(0,20):[];
    return {title:'Modifica ai file',status:'completed',command:'',filePath:'',files,diff:short(part.diff),output:''};
  }
  const tool=short(part?.tool||'Strumento',80);
  const command=short(input.command||input.cmd||input.patch,2000);
  const filePath=short(input.filePath||input.path||input.file||'',500);
  const files=Array.isArray(meta.files)?meta.files.filter(x=>typeof x==='string').slice(0,20):[];
  const diff=short(meta.diff||input.diff||(input.oldString!==undefined && input.newString!==undefined
    ? `Prima:\n${short(input.oldString,600)}\nDopo:\n${short(input.newString,600)}` : ''),2000);
  return {title:short(state.title||tool,180),tool,status:short(state.status||'pending',30),
    command,filePath,files,diff,output:short(state.output||state.error,800)};
}
