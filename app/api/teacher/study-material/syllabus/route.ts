import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {PDFParser} from "pdf2json";

export const runtime="nodejs";
export const maxDuration=300;

const MARKERS=new Map([["\x14",1],["\x0e",2],["\x04",2],["\x07",3],["\x19",4]]);
const SUBJECT_RANGES=[
 [1,12,"HISTORY"],[13,26,"GEOGRAPHY"],[27,29,"INDIAN SOCIETY"],[30,35,"POLITY"],
 [36,45,"GOVERNANCE & SOCIAL JUSTICE"],[46,50,"INTERNATIONAL RELATIONS"],
 [51,59,"ECONOMY"],[60,67,"SCIENCE & TECHNOLOGY"],[68,74,"ENVIRONMENT & ECOLOGY"],
 [75,77,"INTERNAL SECURITY"],[78,78,"DISASTER MANAGEMENT"],[79,84,"ETHICS, INTEGRITY & APTITUDE"]
] as const;

function clean(v:unknown){
 return String(v??"").replace(/[\uf0a3\uf076]/g,"").replace(/\s+/g," ").trim();
}
function subjectForPage(page:number){
 for(const [a,b,s] of SUBJECT_RANGES) if(page>=a&&page<=b) return s;
 return "SYLLABUS";
}
function defaultSection(page:number){
 if(page<=4) return "ANCIENT HISTORY";
 if(page===5) return "MODERN HISTORY";
 if(page===6) return "POST INDEPENDENCE CONSOLIDATION";
 if(page===7) return "WORLD HISTORY";
 if(page>=9&&page<=12) return "INDIAN CULTURE";
 if(page>=13&&page<=19) return "PHYSICAL GEOGRAPHY";
 if(page===20) return "PHYSICAL GEOGRAPHY OF INDIA";
 if(page===21) return "HUMAN GEOGRAPHY";
 if(page>=22&&page<=24) return "ECONOMIC GEOGRAPHY";
 if(page>=25&&page<=26) return "CONTEMPORARY ISSUES";
 if(page>=28&&page<=29) return "CONTEMPORARY ISSUES";
 if(page>=34&&page<=35) return "CONTEMPORARY ISSUES";
 if(page>=42&&page<=45) return "CONTEMPORARY ISSUES";
 if(page>=49&&page<=50) return "CONTEMPORARY ISSUES";
 if(page>=58&&page<=59) return "CONTEMPORARY ISSUES";
 if(page>=66&&page<=67) return "CONTEMPORARY ISSUES";
 if(page>=72&&page<=74) return "CONTEMPORARY ISSUES";
 if(page>=76&&page<=77) return "CONTEMPORARY ISSUES";
 if(page===78) return "DISASTER MANAGEMENT";
 if(page>=83) return "CONTEMPORARY ISSUES";
 return null;
}
function sectionAt(page:number,side:"left"|"right",y:number,base:string|null){
 if(page===20){
  if(side==="left"&&y>=590) return "HUMAN GEOGRAPHY";
  return "PHYSICAL GEOGRAPHY OF INDIA";
 }
 if(page===60){
  if(y>=650) return "BIOLOGY";
  if(y>=420) return "PHYSICS";
  if(y>=210) return "CHEMISTRY";
 }
 const transitions:[[number,string,number,("left"|"right"|"both")?] , ...Array<[number,string,number,("left"|"right"|"both")?]>]=[
  [2,"MEDIEVAL HISTORY",650,"both"],[5,"MODERN HISTORY",660,"both"],
  [6,"POST INDEPENDENCE CONSOLIDATION",660,"both"],[7,"WORLD HISTORY",690,"both"],
  [11,"CONTEMPORARY ISSUES",85,"both"],[25,"CONTEMPORARY ISSUES",450,"both"],
  [28,"CONTEMPORARY ISSUES",270,"both"],[34,"CONTEMPORARY ISSUES",470,"both"],
  [42,"CONTEMPORARY ISSUES",390,"both"],[49,"CONTEMPORARY ISSUES",690,"both"],
  [58,"CONTEMPORARY ISSUES",270,"both"],[66,"CONTEMPORARY ISSUES",300,"both"],
  [72,"CONTEMPORARY ISSUES",660,"both"],[76,"CONTEMPORARY ISSUES",330,"both"],
  [78,"CONTEMPORARY ISSUES",490,"both"],[83,"CONTEMPORARY ISSUES",460,"both"]
 ];
 for(const [p,name,cut,which] of transitions){
  if(page===p&&y>=cut&&(which==="both"||which===side)) return name;
 }
 return base;
}
async function extractColumn(page:any,side:"left"|"right",pageNo:number){
 const content=await page.getTextContent();
 const viewport=page.getViewport({scale:1});
 const mid=viewport.width/2;
 const items=(content.items as any[]).filter(x=>typeof x.str==="string"&&x.str.trim()).map(x=>({
  str:String(x.str),x:Number(x.transform?.[4]??0),y:Number(viewport.height-(x.transform?.[5]??0))
 })).filter(x=>(side==="left"?x.x<mid:x.x>=mid)&&x.y>35&&x.y<viewport.height-25);
 const lines:{y:number,parts:{str:string,x:number}[]}[]=[];
 for(const item of items.sort((a,b)=>a.y-b.y||a.x-b.x)){
  const last=lines[lines.length-1];
  if(!last||Math.abs(last.y-item.y)>5) lines.push({y:item.y,parts:[item]});
  else last.parts.push(item);
 }
 return lines.map(line=>({y:line.y,text:line.parts.sort((a,b)=>a.x-b.x).map(x=>x.str).join(" ")}));
}
function parseColumn(lines:{y:number,text:string}[],pageNo:number,side:"left"|"right",base:string|null){
 const out:{title:string,marker:string,page:number,section:string|null,y:number}[]=[];
 let current:{title:string,marker:string,page:number,section:string|null,y:number}|null=null;
 let section=base;
 const finish=()=>{if(current){current.title=clean(current.title);if(current.title)out.push(current);current=null;}};
 for(const line of lines){
  let raw=line.text.replace(/[\uf0a3\uf076]/g," ").replace(/\s+/g," ").trim();
  if(!raw) continue;
  const markerMatch=raw.match(/[\x14\x0e\x04\x07\x19]/);
  const marker=markerMatch?.[0];
  const sectionName=sectionAt(pageNo,side,line.y,section);
  if(marker){
   finish();
   const title=clean(raw.replace(marker," "));
   current={title,marker,page:pageNo,section:sectionName,y:line.y};
   section=sectionName;
   continue;
  }
  const upper=raw.toUpperCase();
  const possibleHeading=/^[A-Z][A-Z& ,.'’()\-0-9]+$/.test(raw)&&raw.length>=4;
  if(possibleHeading&&!/^(UPSC|SYLLABUS|WWW|HISTORY|GEOGRAPHY|INDIAN SOCIETY|POLITY)$/.test(upper)){
   const normalized=upper.replace(/\s+/g," ").trim();
   const known=["CHEMISTRY","PHYSICS","BIOLOGY","CONTEMPORARY ISSUES","ANCIENT HISTORY","MEDIEVAL HISTORY","MODERN HISTORY","POST INDEPENDENCE CONSOLIDATION","WORLD HISTORY","INDIAN CULTURE","PHYSICAL GEOGRAPHY","PHYSICAL GEOGRAPHY OF INDIA","HUMAN GEOGRAPHY","ECONOMIC GEOGRAPHY","CONTEMPORARY ISSUES"];
   if(known.includes(normalized)){finish();section=normalized;continue;}
  }
  if(current) current.title=clean(current.title+" "+raw);
 }
 finish();
 return out;
}

export async function POST(req:Request){
 try{
  const s=await createClient();
  const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can import the syllabus."},{status:403});
  const f=(await req.formData()).get("file");
  if(!(f instanceof File))return NextResponse.json({error:"PDF is required."},{status:400});
  if(f.size>50*1024*1024)return NextResponse.json({error:"PDF must be 50 MB or smaller."},{status:400});
  if(f.type&&f.type!=="application/pdf")return NextResponse.json({error:"Only PDF files are supported."},{status:400});

  const bytes=Buffer.from(await f.arrayBuffer());
  const parser=new PDFParser();
  const pdfData:any=await new Promise((resolve,reject)=>{
   parser.on("pdfParser_dataReady",(data:any)=>resolve(data));
   parser.on("pdfParser_dataError",(err:any)=>reject(err?.parserError||err));
   parser.parseBuffer(bytes);
  });
  const pages=pdfData?.Pages||[];
  const pageCount=pages.length;
  if(!pageCount)throw new Error("The PDF contains no readable pages.");
  const parsed:any[]=[];
  for(let pageNo=1;pageNo<=pageCount;pageNo++){
   const page=pages[pageNo-1];
   const base=defaultSection(pageNo);
   for(const side of ["left","right"] as const){
    const lines=extractColumn(page,side,pageNo);
    parsed.push(...parseColumn(lines,pageNo,side,base).map(x=>({...x,side})));
   }
  }
  parsed.sort((a,b)=>a.page-b.page||(a.side===b.side?a.y-b.y:(a.side==="left"?-1:1)));
  const storagePath=p.id+"/"+crypto.randomUUID()+"-"+f.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const {error:storageError}=await s.storage.from("ai-study-syllabus").upload(storagePath,f,{contentType:"application/pdf",upsert:false});
  if(storageError)throw new Error("Could not store the syllabus PDF: "+storageError.message);

  const sourceTitle=String(f.name).replace(/\.pdf$/i,"").replace(/[_-]+/g," ").trim()||"Master Syllabus";
  const exam=/UPSC/i.test(f.name)?"UPSC":"MPSC";
  const year=(f.name.match(/20\d{2}[-–]\d{2}/)?.[0]||"").replace("–","-")||null;
  const {data:src,error:srcErr}=await s.from("ai_study_syllabus_sources").insert({
   name:sourceTitle,exam,academic_year:year,source_file_name:f.name,source_pages:pageCount,storage_path:storagePath,status:"active",created_by:p.id
  }).select("id").single();
  if(srcErr)throw new Error(srcErr.message||"Could not create syllabus source.");
  if(!src?.id)throw new Error("Could not create syllabus source.");

  const sourceId=src.id;
  const rootId=crypto.randomUUID();
  const rows:any[]=[{id:rootId,source_id:sourceId,parent_id:null,node_type:"root",title:sourceTitle,depth:0,source_page:1,source_order:0,is_leaf:false,status:"active"}];
  const parentByPath=new Map<string,string>();
  parentByPath.set("",rootId);
  let rowOrder=1;
  for(const item of normalized){
   const path=item.path as string[];
   if(!path.length)continue;
   const title=path[path.length-1];
   const depth=path.length;
   const parentPath=path.slice(0,-1).join("\u001f");
   const parent=parentByPath.get(parentPath)||rootId;
   const keyPath=path.join("\u001f");
   if(parentByPath.has(keyPath))continue;
   const id=crypto.randomUUID();
   const node_type=item.leaf?"micro_topic":depth===1?"subject":depth===2?"section":depth===3?"topic":depth===4?"subtopic":"micro_detail";
   rows.push({id,source_id:sourceId,parent_id:parent,title,depth,node_type,source_page:item.page,source_order:rowOrder++,is_leaf:item.leaf,status:"active"});
   parentByPath.set(keyPath,id);
  }

  const oldResult=await s.from("ai_study_syllabus_sources").select("id").eq("source_file_name",f.name).eq("status","active");
  const oldRows=oldResult.data??[];
  for(const x of oldRows){
   const oldId=x?.id;
   if(oldId&&oldId!==sourceId)await s.from("ai_study_syllabus_sources").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",oldId);
  }
  for(let i=0;i<rows.length;i+=500){
   const {error}=await s.from("ai_study_syllabus_nodes").insert(rows.slice(i,i+500));
   if(error)throw new Error(error.message);
  }
  return NextResponse.json({ok:true,nodes:rows.length-1,sourceId,sourcePages:pageCount,parser:"deterministic-pdf"});
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Syllabus import failed."},{status:500});
 }
}