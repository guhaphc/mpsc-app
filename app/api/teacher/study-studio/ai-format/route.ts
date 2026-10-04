import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {GoogleGenAI} from "@google/genai";

export const runtime="nodejs";
export const maxDuration=300;

const allowedTags=new Set(["p","br","div","span","h1","h2","h3","h4","strong","b","em","i","u","ul","ol","li","blockquote","a","font"]);
const allowedStyles=new Set(["color","background-color","font-family","font-size","font-weight","font-style","text-decoration","text-align","line-height","margin-top","margin-bottom"]);

function sanitize(html:string){
 const doc=new DOMParser().parseFromString(String(html||""),"text/html");
 const walk=(el:Element)=>{
  Array.from(el.children).forEach(walk);
  if(!allowedTags.has(el.tagName)){el.replaceWith(...Array.from(el.childNodes));return;}
  Array.from(el.attributes).forEach(a=>{
   const n=a.name.toLowerCase();
   if(n.startsWith("on")||n==="class"||n==="id"||n==="contenteditable")el.removeAttribute(a.name);
  });
  if(el.hasAttribute("style")){
   const safe=Array.from(el.getAttribute("style")!.split(";")).map(x=>x.trim()).filter(Boolean).filter(x=>allowedStyles.has(x.split(":")[0].trim().toLowerCase())).join("; ");
   safe?el.setAttribute("style",safe):el.removeAttribute("style");
  }
  if(el.tagName==="A"){
   const href=el.getAttribute("href")||"";
   if(!/^(https?:|mailto:)/i.test(href))el.removeAttribute("href");
   else{el.setAttribute("target","_blank");el.setAttribute("rel","noopener noreferrer");}
  }
 };
 Array.from(doc.body.children).forEach(walk);
 return doc.body.innerHTML;
}

function visibleText(html:string){
 return String(html||"")
  .replace(/<br\s*\/?>/gi,"\n")
  .replace(/<\/(p|div|h[1-4]|li|blockquote|ul|ol)>/gi,"\n")
  .replace(/<[^>]*>/g,"")
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
  .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
  .replace(/\r/g,"");
}

function normalizedText(html:string){return visibleText(html).replace(/[ \t]+/g," ").replace(/\n[ \t]+/g,"\n").replace(/[ \t]+\n/g,"\n").trim()}

export async function POST(req:Request){
 try{
  const s=await createClient();
  const {data}=await s.auth.getClaims();
  if(!data?.claims)return NextResponse.json({error:"Login required."},{status:401});
  const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
  if(!p||p.role!=="teacher"||p.account_status!=="active")return NextResponse.json({error:"Only active teachers can use AI formatting."},{status:403});

  const body=await req.json();
  const source=sanitize(String(body.html||""));
  if(!source.trim())return NextResponse.json({error:"Editor content is empty."},{status:400});
  const key=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if(!key)return NextResponse.json({error:"Gemini API key is not configured on the server."},{status:500});

  const ai=new GoogleGenAI({apiKey:key});
  const prompt=`You are a professional MPSC/UPSC study-material formatter.

FORMAT ONLY. Do not rewrite the source.

Rules:
1. Preserve every word, number, punctuation mark, symbol, example, quote, question and factual statement exactly.
2. Do not translate, summarise, expand, correct, reorder or remove content.
3. You may ONLY change HTML structure and presentation.
4. Identify hierarchy from the existing text: document title, major headings, subheadings, topics, subtopics, paragraphs, bullets and numbered lists.
5. Use h1 for the main title, h2 for major headings, h3 for subheadings/topics and h4 for lower-level subtopics when appropriate.
6. Keep normal explanatory text in p elements.
7. Convert text that is clearly a list into ul or ol, without changing list item wording.
8. Use strong sparingly for important keywords/phrases already present in the source. Never add new words.
9. Apply professional academic spacing using margin-bottom and line-height. Avoid excessive blank lines.
10. Preserve Marathi Unicode and English text exactly.
11. Return ONLY complete HTML. No markdown fences, comments or explanation.
12. Allowed tags: p, br, div, span, h1, h2, h3, h4, strong, b, em, i, u, ul, ol, li, blockquote, a, font.
13. Allowed inline styles: color, background-color, font-family, font-size, font-weight, font-style, text-decoration, text-align, line-height, margin-top, margin-bottom.

SOURCE HTML:
${source}`;

  const result=await ai.models.generateContent({
   model:"gemini-2.5-flash",
   contents:prompt,
   config:{temperature:0}
  });
  const candidate=String((result as any).text||"").trim().replace(/^\`\`\`html\s*/i,"").replace(/^\`\`\`\s*/,"").replace(/\s*\`\`\`$/,"").trim();
  if(!candidate)throw new Error("AI returned no formatted HTML.");
  const output=sanitize(candidate);
  if(normalizedText(output)!==normalizedText(source)){
   return NextResponse.json({error:"AI formatting was rejected because it changed the source text. Your original content was not modified."},{status:422});
  }
  return NextResponse.json({ok:true,html:output});
 }catch(e:any){
  return NextResponse.json({error:e?.message||"Could not format material with AI."},{status:500});
 }
}