import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAuth } from "./mfa-middleware";

export const listAdminNotifications = createServerFn({method:"POST"}).middleware([requireMfaAuth]).handler(async({context})=>{
  const {assertAdminPage}=await import("./admin-session.server");
  const {admin}=await assertAdminPage(context);
  const {data,error}=await admin.from("platform_notifications").select("id,kind,title,body,link,read_at,created_at").order("created_at",{ascending:false}).limit(20);
  if(error) throw new Error("Não foi possível carregar os dados.");
  return data ?? [];
});
export const markAdminNotifications = createServerFn({method:"POST"}).middleware([requireMfaAuth]).inputValidator(i=>z.object({id:z.string().uuid().optional()}).parse(i)).handler(async({context,data})=>{
  const {assertAdminPage}=await import("./admin-session.server");
  const {admin}=await assertAdminPage(context);
  let q=admin.from("platform_notifications").update({read_at:new Date().toISOString()}).is("read_at",null);
  if(data.id) q=q.eq("id",data.id);
  const {error}=await q;
  if(error) throw new Error("Não foi possível salvar.");
  return {ok:true};
});