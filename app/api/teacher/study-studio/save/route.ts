import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

function sanitize(html:string){
 let x=String(html||"");
 x=x.replace(/<script[^>]*>[\w\W]*?<\/script>/gi,"").replace(/<style[^>]*>[\w\W]*?<\/style>/gi,"").replace(/javascript:/gi,"");
 const allowed=new Set(["p","br","div","span","h1","h2","h3","h4","strong","b","em","i","u","ul","ol","li","blockquote","a","font"]);
 const safeStyles=new Set(["color","background-color","font-family","font-size","font-weight","font-style","text-decoration","text-align","line-height","margin-top","margin-bottom"]);
 x=x.replace(/<\/?([a-z0-9]+)([^>]*)>/gi,(m,tag,attrs)=>{
  const t=tag.toLowerCase();
  if(!allowed.has(t))return "";
  if(m.startsWith("</"))return "</"+t+">";
  if(t==="a"){
   const href=(attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]||"#").replace(/javascript:/gi,"");
   return '<a href="'+href+'" target="_blank" rel="noopener noreferrer">';
  }
  const styleMatch=attrs.match(/style\s*=\s*["']([^"']*)["']/i);
  if(styleMatch){
   const safe=styleMatch[1].split(";").map((s:string)=>s.trim()).filter(Boolean).filter((s:string)=>safeStyles.has(s.split(":")[0].trim().toLowerCase())).join("; ");
   return safe ? "<"+t+' style="'+safe.replace(/"/g,"&quot;")+'">' : "<"+t+">";
  }
  return "<"+t+">";
 });
 return x;
}
export async function POST(req:Request){
 try{
  const s=await createClient();const {data}=await s.auth.getClaims();if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can edit."},{status:403});
  const b=await req.json(),topicId=String(b.topicId||""),title=String(b.title||"").trim(),html=sanitize(String(b.content_html||""));
  if(!topicId||!title)return NextResponse.json({error:"Topic and title are required."},{status:400});
  if(!html.trim())return NextResponse.json({error:"Editor content is empty."},{status:400});
  const {data:topic,error}=await s.from("study_topics").update({title,notes:"",content_blocks:[{type:"richtext",html}],status:"draft",updated_at:new Date().toISOString()}).eq("id",topicId).select("id,title,notes,content_blocks,status").single();
  if(error||!topic)throw new Error(error?.message||"Could not save draft.");
  return NextResponse.json({ok:true,topic});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not save draft."},{status:500});}
}