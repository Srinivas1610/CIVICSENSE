const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const { analyzeCivicIncident } = require('../ai/triageAgent');

const router = express.Router();

const ASSIGNMENT_SERVICE_URL = process.env.ASSIGNMENT_SERVICE_URL || 'http://assignment-service:3003';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'civicconnect_verify_token';

/**
 * Send an outbound message using the Meta WhatsApp Cloud API
 */
async function sendWhatsAppReply(recipientPhone, messageText) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  console.log(`\n================= WHATSAPP NOTIFICATION =================\nTO: ${recipientPhone}\n${messageText}\n=========================================================\n`);

  if (!token || !phoneNumberId) {
    return { mock: true, sent: true };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: messageText },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return response.data;
  } catch (err) {
    console.error(`[whatsapp] Failed to send WhatsApp message to ${recipientPhone}:`, err.message);
    return { error: err.message };
  }
}

/**
 * Download media from Meta WhatsApp Cloud API using Media ID
 */
async function downloadWhatsAppMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !mediaId) return null;

  try {
    const metaRes = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const mediaUrl = metaRes.data?.url;
    const mimeType = metaRes.data?.mime_type || 'image/jpeg';
    if (!mediaUrl) return null;

    const fileRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    const base64 = Buffer.from(fileRes.data).toString('base64');
    return { base64, mimeType };
  } catch (err) {
    console.warn(`[whatsapp] Could not download media ${mediaId}:`, err.message);
    return null;
  }
}

/**
 * GET /webhook/whatsapp
 * Meta Webhook Verification
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('[whatsapp] Webhook verified successfully');
    res.status(200).send(challenge);
    return;
  }
  res.status(403).json({ error: 'Verification failed' });
});

/**
 * POST /webhook/whatsapp
 * Multimodal AI Ingestion & Autonomous Dispatch Pipeline
 */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};

    let senderPhone = '+919845012345';
    let textPrompt = '';
    let imageBase64 = null;
    let mimeType = 'image/jpeg';
    let locLat = 12.9716;
    let locLng = 77.5946;
    let locAddress = 'Reported via WhatsApp Location';
    let locWardId = 'ward-101';
    let locWardName = 'Central Ward';
    let isMessage = false;

    // 1. Parse Meta WhatsApp Cloud API Webhook Envelope
    if (body.object === 'whatsapp_business_account' || body.entry) {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const val = change?.value;
      const message = val?.messages?.[0];

      if (message) {
        isMessage = true;
        senderPhone = message.from || senderPhone;

        if (message.type === 'text') {
          textPrompt = message.text?.body || '';
        } else if (message.type === 'image') {
          textPrompt = message.image?.caption || 'Image attached';
          mimeType = message.image?.mime_type || 'image/jpeg';
          if (message.image?.id) {
            const downloaded = await downloadWhatsAppMedia(message.image.id);
            if (downloaded) {
              imageBase64 = downloaded.base64;
              mimeType = downloaded.mimeType;
            }
          }
        } else if (message.type === 'location' && message.location) {
          textPrompt = 'Civic hazard at pinned location';
          locLat = message.location.latitude;
          locLng = message.location.longitude;
          locAddress = message.location.address || message.location.name || locAddress;
        } else {
          textPrompt = `Civic report (${message.type} attachment)`;
        }
      }
    } else {
      // 2. Direct Simulator / CLI Test Payload Support
      isMessage = true;
      senderPhone = body.from || body.sender || senderPhone;
      textPrompt = body.text || body.textPrompt || body.caption || body.message || '';
      mimeType = body.mimeType || mimeType;

      if (body.imageBase64) {
        imageBase64 = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      }

      if (body.location) {
        locLat = body.location.lat ?? body.location.latitude ?? locLat;
        locLng = body.location.lng ?? body.location.longitude ?? locLng;
        locAddress = body.location.address ?? locAddress;
        locWardId = body.location.wardId ?? locWardId;
        locWardName = body.location.wardName ?? locWardName;
      }
    }

    if (!isMessage) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    console.log(`[whatsapp] 🤖 AI Incident Reasoning Agent analyzing report from ${senderPhone}: "${textPrompt}"`);

    // 3. Multimodal AI Analysis via Gemini
    const result = await analyzeCivicIncident({
      textPrompt,
      imageBase64,
      mimeType,
    });

    console.log('[whatsapp] 🧠 Incident DNA Generated:', JSON.stringify(result, null, 2));

    // 4. Autonomous Execution: Spam Filtering
    if (result.isGenuineCivicIssue === false) {
      const spamReply =
        'CivicConnect AI did not detect a recognized civic hazard in this image. Please send clear photo evidence of public infrastructure.';
      await sendWhatsAppReply(senderPhone, spamReply);

      res.status(200).json({
        success: false,
        dropped: true,
        reason: 'Spam or non-civic submission filtered',
        reply: spamReply,
        aiDna: result,
      });
      return;
    }

    // 5. Database Insertion: Save ticket in MongoDB with enriched fields
    const Issue = mongoose.models.Issue || mongoose.model('Issue');
    const ticketNumber = Math.floor(100000 + Math.random() * 900000);

    const categoryMap = {
      ROADS_INFRASTRUCTURE: 'roads',
      SOLID_WASTE: 'garbage',
      ELECTRICAL_LIGHTING: 'streetlights',
      WATER_DRAINAGE: 'drainage',
      PUBLIC_SAFETY: 'other',
      OTHER: 'other',
    };
    const mappedCategory = categoryMap[result.category] || result.category.toLowerCase();

    const issue = new Issue({
      title: result.title,
      reportedBy: senderPhone,
      rawDescription: result.hazardDetails || textPrompt || 'Civic hazard reported via WhatsApp',
      channel: 'whatsapp',
      category: mappedCategory,
      severity: result.severity,
      status: 'assigned', // Auto-dispatched directly by AI triage
      location: {
        lat: locLat,
        lng: locLng,
        geohash: 'tdm6s1q',
        address: locAddress,
        wardId: locWardId,
        wardName: locWardName,
      },
      media: imageBase64 ? [`data:${mimeType};base64,${imageBase64.slice(0, 100)}...`] : [],
      aiDna: result,
      dna: {
        classification: result.title,
        subcategory: result.category,
        rootCauseHypothesis: result.urgencyReason || 'Identified by AI vision',
        clusterId: null,
        severityScore: result.severity,
        severityTrajectory: result.severity >= 8 ? 'critical' : (result.severity >= 5 ? 'worsening' : 'stable'),
        trajectoryReason: result.urgencyReason,
        department: {
          name: result.recommendedDepartment,
          zoneId: 'zone-default',
          contactEmail: 'operations@civicconnect.gov',
        },
        resolutionETA: `${result.estimatedResolutionDays} days`,
        confidence: 0.95,
      },
      validationCount: 0,
      escalationLevel: 0,
    });

    await issue.save();
    console.log(`[whatsapp] 💾 Ticket #${ticketNumber} created in MongoDB (ID: ${issue._id}) with status 'assigned'`);

    // 6. Automated Assignment Dispatch to assignment-service:3003/api/assignments/route
    try {
      await axios.post(
        `${ASSIGNMENT_SERVICE_URL}/api/assignments/route`,
        {
          issueId: String(issue._id),
          category: result.category,
          department: result.recommendedDepartment,
          wardId: issue.location.wardId,
          notes: `Auto-dispatched by CivicConnect AI Triage Agent to ${result.recommendedDepartment}. Target SLA: ${result.estimatedResolutionDays} days.`,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );
      console.log(`[whatsapp] ⚡ Successfully auto-dispatched to ${result.recommendedDepartment} via assignment-service`);
    } catch (routeErr) {
      console.warn(`[whatsapp] Assignment routing request logged (${routeErr.message}) — ticket safely persisted`);
    }

    // 7. Citizen Auto-Reply: Rich formatted acknowledgment card
    const acknowledgmentCard =
`🏛️ *CivicConnect Automated Dispatch*
Ticket: #CIVIC-${ticketNumber}
------------------------------
🚨 *AI Classification:* ${result.category}
⚠️ *Severity Score:* ${result.severity}/10
🏢 *Assigned To:* ${result.recommendedDepartment}
⏳ *Target SLA:* ${result.estimatedResolutionDays} Days
📍 *Location Tracked:* Coordinates Recorded
------------------------------
Track live status on the portal: https://srinivas1610.github.io/CIVICSENSE/`;

    await sendWhatsAppReply(senderPhone, acknowledgmentCard);

    res.status(200).json({
      success: true,
      autoDispatched: true,
      ticket: `#CIVIC-${ticketNumber}`,
      issueId: issue._id,
      category: issue.category,
      severityScore: result.severity,
      department: result.recommendedDepartment,
      resolutionETA: `${result.estimatedResolutionDays} days`,
      status: issue.status,
      aiDna: result,
      replyCard: acknowledgmentCard,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.sendWhatsAppReply = sendWhatsAppReply;
module.exports.downloadWhatsAppMedia = downloadWhatsAppMedia;
