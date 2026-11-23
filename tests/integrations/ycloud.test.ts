import {createHmac} from "node:crypto";
import {describe,it,expect} from "vitest";
import {authentic,mapEvent,routes} from "@/features/integrations/whatsapp/contracts";
import {internationalPhone} from "@/features/integrations/whatsapp/phone";
const config={YCLOUD_DESIGN_WABA_ID:"111",YCLOUD_TECHNOLOGY_WABA_ID:"222", NODE_ENV:"test" as const};
function event(index=0){const route=routes[index];return {id:"evt",type:"whatsapp.inbound_message.received",whatsappInboundMessage:{id:"msg",to:route.number,wabaId:index?"222":"111",from:"+447911123456",customerProfile:{name:"Test"},text:{body:"PRIVATE"}}};}
describe("YCloud intake",()=>{
  it.each([0,1])("routes signed recipient identity %s",i=>{const result=mapEvent(event(i),config);expect(result.route).toBe(routes[i]);expect(result.input).toMatchObject({contactName:"Test",phoneCountryCode:"+44",source:"whatsapp",status:"new"});expect(result.input?.acquisitionSource).toBeUndefined();expect(JSON.stringify(result.input)).not.toContain("PRIVATE");expect(result.input).not.toHaveProperty("companyName");});
  it("requires both business identities and a usable phone",()=>{for(const change of [{from:"BSUID123"},{to:"+12345678"},{wabaId:"other"}]){const raw=event();Object.assign(raw.whatsappInboundMessage,change);expect(mapEvent(raw,config).input).toBeUndefined();}});
  it("attributes ad referrals, supplies a provisional name and reuses the message key",()=>{const raw=event();Object.assign(raw.whatsappInboundMessage,{customerProfile:null,referral:{source_type:"ad",source_id:"123"}});const result=mapEvent(raw,config);expect(result.input?.contactName).toContain("unconfirmed");expect(result.input?.acquisitionSource).toBe("meta ad");expect(mapEvent({...raw,id:"retry"},config).input?.eventId).toBe(result.input?.eventId);});
  it("validates raw bytes, timestamp, and signature",()=>{const body=Buffer.from('{"message":"test"}'),ts=1700000000;const header="t="+ts+",s="+createHmac("sha256","secret").update(ts+".").update(body).digest("hex");expect(authentic(body,header,"secret",ts*1000)).toBe(true);expect(authentic(body,header,"secret",(ts+301)*1000)).toBe(false);expect(authentic(Buffer.from("changed"),header,"secret",ts*1000)).toBe(false);});
  it("builds manual follow-up links from international numbers only",()=>{expect(internationalPhone("+44 7911 123456")).toMatchObject({call:"tel:+447911123456",chat:"https://wa.me/447911123456"});expect(internationalPhone("phone12345678")).toBeNull();expect(internationalPhone("9876543210")).toBeNull();});
});
