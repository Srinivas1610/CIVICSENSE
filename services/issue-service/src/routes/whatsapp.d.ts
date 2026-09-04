import { Router } from 'express';

declare const router: Router;
export default router;
export declare function sendWhatsAppReply(recipientPhone: string, messageText: string): Promise<any>;
export declare function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null>;
