"use client";
import {useEffect,useState} from "react";
import {deviceEnabled,deviceKey,registerDevice,removeDevice,testDevice} from "./devices";
export function Devices(){
  const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{let active=true;(async()=>{
    if(!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration=await navigator.serviceWorker.getRegistration("/");
    const sub=await registration?.pushManager.getSubscription();
    if(sub && await deviceEnabled(sub.endpoint) && active)setEnabled(true);
  })().catch(()=>{});return()=>{active=false;};},[]);
  async function act(action:"enable"|"disable"|"test"){
    setBusy(true);setMessage("");
    try{
      if(!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw Error("Open the HTTPS app in a supported browser. On iPhone, add it to the Home Screen and open it there.");
      if(action==="enable" && await Notification.requestPermission()!=="granted") throw Error("Allow notifications in this device's settings to enable push.");
      await navigator.serviceWorker.register("/nexyrium-push.js",{scope:"/"});
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(action==="enable"){
        const publicKey=await deviceKey();
        const key=Uint8Array.from(atob(publicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
        subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        await registerDevice(subscription.endpoint);setEnabled(true);setMessage("Phone notifications enabled.");
      } else if(action==="disable"){
        if(subscription){await removeDevice(subscription.endpoint);await subscription.unsubscribe();}
        setEnabled(false);setMessage("Phone notifications disabled.");
      } else {
        if(!subscription || !await testDevice(subscription.endpoint))throw Error("The test was not accepted. Enable this device again.");
        setMessage("Test accepted by the push service. Check your device notifications.");
      }
    }catch(error){setMessage(error instanceof Error ? error.message : "Could not change this device.");}
    finally{setBusy(false);}
  }
  return <section className="card p-4"><h2 className="font-semibold">Phone notifications</h2><p className="my-2 text-sm">Receive a private alert on this device when an item needs attention.</p>
    <button className="button-secondary" disabled={busy} onClick={()=>act(enabled?"disable":"enable")}>{enabled?"Disable on this device":"Enable on this device"}</button>
    {enabled && <button className="button-secondary ml-2" disabled={busy} onClick={()=>act("test")}>Send test</button>}<p role="status">{message}</p></section>;
}
