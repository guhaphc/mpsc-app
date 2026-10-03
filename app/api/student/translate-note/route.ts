import {NextResponse} from "next/server";
import {GoogleGenAI} from "@google/genai";
import {createClient} from "@/lib/supabase/server";
import {createClient as createSupabaseClient} from "@supabase/supabase-js";

export const runtime="nodejs";
export const maxDuration=180;

const MODEL=process.env.GEMINI_TRANSLATION_MODEL||process.env.GEMINI_NOTES_MODEL||"gemini-3.5-flash-lite";

const TRANSLATION_PROMPT=`
तुम्ही अनुवादक आहात, लेखक नाही. तुमचे काम मूळ English source चा अर्थ बदलणे, सुधारणा करणे किंवा विस्तार करणे नाही; तर तोच आशय विद्यार्थ्यांना सहज समजेल अशा सोप्या आणि अचूक मराठीत मांडणे आहे.

हे साहित्य UPSC, MPSC आणि इतर स्पर्धा परीक्षांच्या अभ्यासासाठी आहे.

मुख्य नियम:
- SOURCE ENGLISH > AI KNOWLEDGE.
- प्रत्येक अर्थपूर्ण वाक्य, परिच्छेद, definition, example, case study, quote, question, important statement, bullet, numbered point, sub-point, list, table, figure/caption आणि आवश्यक footnote पूर्ण भाषांतरित करा.
- Summary करू नका. Short notes बनवू नका. Compress करू नका.
- कोणतीही नवीन माहिती, तथ्य, उदाहरण, मत, निष्कर्ष किंवा बाहेरील ज्ञान जोडू नका.
- Source मधील माहिती चुकीची किंवा अपूर्ण वाटली तरी स्वतःहून दुरुस्त करू नका.
- भाषा अत्यंत सोपी, नैसर्गिक, प्रवाही, स्पष्ट आणि शैक्षणिक ठेवा.
- Google Translate सारखी यांत्रिक वाक्यरचना टाळा.
- लांब वाक्ये अर्थ न गमावता सोप्या वाक्यांत मांडू शकता.
- Technical terms साठी योग्य मराठी संज्ञा वापरा; पहिल्यांदा: मराठी संज्ञा (English Term). नंतर त्याच अध्यायात संज्ञेचे सातत्य ठेवा.
- Heading, subheading, bullet, numbered list, table, quote, example आणि case-study यांची मूळ रचना व क्रम कायम ठेवा.
- "Ignite Your Mind" नेहमी "तुमचे मन प्रज्वलित करा" असे भाषांतर करा.
- व्यक्ती, संस्था, कायदे आणि तत्त्वज्ञानातील संज्ञांची ओळख कायम ठेवा.
- स्वतःचे explanation देऊ नका. Source मध्ये स्पष्टपणे आवश्यक नसल्यास AI explanation तयार करू नका.
- स्वतःची मते किंवा fact-checking जोडू नका.
- Page/chapter sequence बदलू नका.
- योग्य Unicode देवनागरी वापरा; अक्षरे वेगळी तोडू नका.

Output:
फक्त valid JSON द्या.
मुख्य title, notes आणि प्रत्येक subtopic साठी title, content आणि content_blocks परत द्या.
content_blocks मध्ये heading, subheading, paragraph, bullet, numbered, callout आणि table यापैकी source ला योग्य तो प्रकार वापरा.
`;

function adminClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url&&key?createSupabaseClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}):null;
}

function cleanBlocks(v:any){
 if(!Array.isArray(v))return [];
 return v.map((b:any)=>{
  const type=["heading","subheading","paragraph","bullet","numbered","callout","table"].includes(String(b?.type))?String(b.type):"paragraph";
  if(type==="table")return {type,columns:Array.isArray(b.columns)?b.columns.map(String):[],rows:Array.isArray(b.rows)?b.rows.map((r:any)=>Array.isArray(r)?r.map(String):[]):[]};
  if(type==="bullet"||type==="numbered")return {type,items:Array.isArray(b.items)?b.items.map(String).filter(Boolean):[]};
  return {type,text:String(b?.text||"").trim()};
 }).filter((b:any)=>b.type==="table"?(b.columns.length&&b.rows.length):(b.type==="bullet"||b.type==="numbered")?b.items.length:b.text);
}

export async function POST(request:Request){
 try{
  const userClient=await createClient();
  const {data}=await userClient.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Please login again."},{status:401});
  const {data:profile}=await userClient.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="student"||profile.account_status!=="active")return NextResponse.json({error:"Only active students can use translation."},{status:403});

  const body=await request.json();
  const topicId=String(body.topicId||"");
  if(!topicId)return NextResponse.json({error:"Topic is required."},{status:400});

  const {data:topic,error:te}=await userClient.from("study_topics").select("id,title,notes,content_blocks,translation_status,original_language").eq("id",topicId).eq("status","published").single();
  if(te||!topic)return NextResponse.json({error:"Study topic not found."},{status:404});
  const {data:subs,error:se}=await userClient.from("study_subtopics").select("id,title,content,content_blocks,marathi_content,marathi_content_blocks,translation_status,sort_order").eq("topic_id",topicId).order("sort_order");
  if(se)throw se;

  const cached=!!subs?.length && subs.every((s:any)=>s.translation_status==="approved"&&String(s.marathi_content||"").trim());
  if(cached){
    return NextResponse.json({ok:true,cached:true,result:{
      title:topic.title,
      notes:topic.notes||"",
      content_blocks:Array.isArray(topic.content_blocks)?topic.content_blocks:[],
      subtopics:(subs||[]).map((s:any)=>({id:s.id,title:s.marathi_content_title||s.title,content:s.marathi_content||"",content_blocks:Array.isArray(s.marathi_content_blocks)?s.marathi_content_blocks:[]})),
    }});
  }

  const key=process.env.GEMINI_API_KEY;
  if(!key)return NextResponse.json({error:"Translation service is not configured."},{status:503});

  const source={title:topic.title,notes:topic.notes||"",content_blocks:Array.isArray(topic.content_blocks)?topic.content_blocks:[],subtopics:(subs||[]).map((s:any)=>({id:s.id,title:s.title,content:s.content||"",content_blocks:Array.isArray(s.content_blocks)?s.content_blocks:[],sort_order:s.sort_order}))};
  const ai=new GoogleGenAI({apiKey:key});
  const response=await ai.models.generateContent({
   model:MODEL,
   contents:TRANSLATION_PROMPT+"\nSOURCE MATERIAL:\n"+JSON.stringify(source),
   config:{responseMimeType:"application/json",maxOutputTokens:50000}
  });
  const translated=JSON.parse((response.text||"").trim());
  if(!Array.isArray(translated.subtopics))throw new Error("Gemini returned an incomplete translation.");

  const admin=adminClient();
  const writer=admin||userClient;
  const now=new Date().toISOString();

  for(const item of translated.subtopics){
   const original=(subs||[]).find((s:any)=>s.id===item.id);
   if(!original)continue;
   await writer.from("study_subtopics").update({
     marathi_content:String(item.content||""),
     marathi_content_blocks:cleanBlocks(item.content_blocks),
     translation_status:"draft",
     translation_model:MODEL,
     translation_updated_at:now
   }).eq("id",original.id);
  }

  const usage=(response as any).usageMetadata||{};
  await userClient.from("ai_study_generation_logs").insert({
    node_id:null,note_version_id:null,user_id:profile.id,operation:"translate",model:MODEL,status:"completed",
    input_tokens:Number(usage.promptTokenCount||0)||null,output_tokens:Number(usage.candidatesTokenCount||0)||null,total_tokens:Number(usage.totalTokenCount||0)||null,completed_at:now
  });

  return NextResponse.json({ok:true,cached:false,result:{
    title:translated.title||topic.title,
    notes:translated.notes||"",
    content_blocks:cleanBlocks(translated.content_blocks),
    subtopics:translated.subtopics.map((s:any)=>({id:s.id,title:s.title,content:s.content||"",content_blocks:cleanBlocks(s.content_blocks)}))
  }});
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Translation failed."},{status:500});
 }
}