import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
export default async function Home(){const supabase=await createClient();const {data:{claims}}=await supabase.auth.getClaims();redirect(claims?"/dashboard":"/login")}