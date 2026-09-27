import {NextResponse} from "next/server";
import {createHash} from "crypto";
import {createClient} from "@/lib/supabase/server";

export const runtime="nodejs";
export const maxDuration=300;

type JsonNode={
 id:string;
 parent_id:string|null;
 title:string;
 node_type:string;
 depth:number;
 source_page:number;
 source_order:number;
 is_leaf:boolean;
 children?:JsonNode[];
};

function examFromFile(name:string){
 return /upsc/i.test(name) ? "UPSC" : "MPSC";
}

function flatten(subjects:JsonNode[]){
 const rows:any[]=[];
 const ids=new Map<string,string>();
 const walk=(node:JsonNode,parentId:string|null)=>{
  const id=crypto.randomUUID();
  ids.set(node.id,id);
  rows.push({
   id,parent_id:parentId,source_node_key:node.id,node_type:node.node_type,title:node.title,
   depth:node.depth,source_page:node.source_page,source_order:node.source_order,is_leaf:!!node.is_leaf
  });
  for(const child of node.children||[])walk(child,id);
 };
 for(const subject of subjects)walk(subject,null);
 return rows;
}

export async function POST(req:Request){
 let createdSourceId:string|null=null;
 try{
  const s=await createClient();
  const {data:claims}=await s.auth.getClaims();
  if(!claims?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",claims.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can import the syllabus."},{status:403});

  const form=await req.formData();
  const file=form.get("file");
  if(!(file instanceof File))return NextResponse.json({error:"JSON file is required."},{status:400});
  if(!/\.json$/i.test(file.name))return NextResponse.json({error:"Please upload the authoritative .json hierarchy file."},{status:400});
  if(file.size>50*1024*1024)return NextResponse.json({error:"JSON file must be 50 MB or smaller."},{status:400});

  const raw=await file.text();
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed?.subjects)||parsed.subjects.length===0)throw new Error("Invalid hierarchy JSON: subjects array is missing.");
  const rows=flatten(parsed.subjects);
  if(!rows.length)throw new Error("The hierarchy contains no syllabus nodes.");
  if(rows.length>10000)throw new Error("Hierarchy exceeds the 10,000-node import limit.");
  const ids=new Set(rows.map(r=>r.source_node_key));
  if(ids.size!==rows.length)throw new Error("Hierarchy JSON contains duplicate node IDs.");

  const sourceHash=createHash("sha256").update(raw).digest("hex");
  const sourceName=String(parsed.source_file||file.name).replace(/\.pdf$/i,"").trim()||file.name;
  const pages=Number(parsed.pages||0)||0;
  const exam=examFromFile(file.name);

  const {data:src,error:srcErr}=await s.from("ai_study_syllabus_sources").insert({
   name:sourceName,exam,academic_year:"2026-27",source_file_name:file.name,source_pages:pages,
   source_hash:sourceHash,status:"draft",created_by:p.id
  }).select("id").single();
  if(srcErr||!src)throw new Error(srcErr?.message||"Could not create syllabus source.");
  createdSourceId=src.id;

  for(let i=0;i<rows.length;i+=500){
   const batch=rows.slice(i,i+500).map(r=>({
    ...r,source_id:src.id,status:"active"
   }));
   const {error}=await s.from("ai_study_syllabus_nodes").insert(batch);
   if(error)throw new Error(error.message);
  }

  const {error:archiveError}=await s.from("ai_study_syllabus_sources")
   .update({status:"archived",updated_at:new Date().toISOString()})
   .eq("status","active").neq("id",src.id)
   .not("source_file_name","ilike","%history%");
  if(archiveError)throw new Error(archiveError.message);

  const {error:activateError}=await s.from("ai_study_syllabus_sources")
   .update({status:"active",updated_at:new Date().toISOString()}).eq("id",src.id);
  if(activateError)throw new Error(activateError.message);

  return NextResponse.json({ok:true,sourceId:src.id,nodes:rows.length,leaves:rows.filter(r=>r.is_leaf).length,subjects:parsed.subjects.length,sourceHash});
 }catch(e:any){
  if(createdSourceId){
   await (async()=>{try{await (await createClient()).from("ai_study_syllabus_sources").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",createdSourceId)}catch{}})();
  }
  return NextResponse.json({error:e?.message||"Syllabus JSON import failed."},{status:500});
 }
}
