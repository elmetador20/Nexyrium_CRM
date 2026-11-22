declare module "web-push" {
  const webPush: { encrypt(publicKey: string, auth: string, payload: Buffer, encoding: "aes128gcm"): { cipherText: Buffer } };
  export default webPush;
}
