/**
 * Official Meta WhatsApp Business Cloud API Integration Service
 * Follows Graph API v21.0 standards
 */

export interface MetaSendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  recipientPhone: string; // E.164 format without + or spaces e.g. "919876543210"
  templateName: string;
  templateLanguage: string; // e.g. "en_US" or "en"
  variables: Record<string, string>; // { "1": "Rahul", "2": "Appointment #123" }
  fallbackToHelloWorldIfNotFound?: boolean; // If custom template does not exist on Meta (#132001), fallback to official hello_world
}

export interface MetaTestResult {
  success: boolean;
  phoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  error?: string;
}

export interface MetaTemplateComponent {
  type: string; // BODY, HEADER, FOOTER, BUTTONS
  format?: string;
  text?: string;
  example?: {
    body_text?: string[][];
  };
}

export interface MetaRawTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: MetaTemplateComponent[];
}

export class WhatsAppService {
  /**
   * Cleans and normalizes phone number to WhatsApp recipient format (digits only, no + or spaces)
   */
  static normalizePhoneForWhatsApp(phone: string): string {
    return (phone || '').replace(/[^0-9]/g, '');
  }

  /**
   * Automatically discovers the WhatsApp Business Account (WABA) ID linked to a given Phone Number ID.
   */
  static async autoDiscoverBusinessAccountId(
    phoneNumberId: string,
    accessToken: string,
    apiVersion: string = 'v21.0'
  ): Promise<string | null> {
    try {
      const cleanPhoneId = (phoneNumberId || '').trim().replace(/['"]/g, '');
      const cleanToken = (accessToken || '').trim().replace(/['"]/g, '');
      const cleanVersion = (apiVersion || 'v21.0').trim().replace(/['"]/g, '') || 'v21.0';

      if (!cleanPhoneId || !cleanToken) return null;

      const url = `https://graph.facebook.com/${cleanVersion}/${encodeURIComponent(cleanPhoneId)}?fields=whatsapp_business_account`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.whatsapp_business_account?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Translates common Meta API errors into clear, actionable developer guidance
   */
  static formatMetaErrorMessage(errorObj: any, status: number): { message: string; code: string } {
    const errCode = errorObj?.code ? String(errorObj.code) : String(status);
    let errMsg = errorObj?.error_user_msg || errorObj?.message || `Meta API error (${status})`;
    if (errorObj?.error_data?.details) {
      errMsg += ` (${errorObj.error_data.details})`;
    }

    if (errCode === '131030' || errMsg.includes('131030') || errMsg.toLowerCase().includes('not in allowed list')) {
      errMsg = `Recipient not in allowed list (Meta Error #131030): Your Meta App is in Development / Test Mode. Meta only permits messages to verified test numbers. To fix: In Meta Developer Dashboard -> WhatsApp -> API Setup, find the "To" recipient dropdown, click "Manage phone number list", add the recipient's phone number, and verify with OTP. (To message anyone without whitelisting, switch your Meta App to Live Mode).`;
    } else if (errCode === '132001' || errMsg.includes('132001') || errMsg.toLowerCase().includes('does not exist in the translation')) {
      errMsg = `Template Not Found in WhatsApp (#132001): The template is not created or approved in your Meta WhatsApp Business Account for this language. "hello_world" (en_US) is WhatsApp's only built-in pre-approved template that works out-of-the-box. To use other template names, create and approve them in Meta WhatsApp Manager, or use "hello_world".`;
    } else if (errCode === '131026' || errMsg.includes('Message undeliverable')) {
      errMsg = `Message Undeliverable (#131026): The recipient number might not have WhatsApp installed, or 24 hours have passed since customer interaction. Use an APPROVED template message for customer-initiated conversations.`;
    } else if (errCode === '190' || errMsg.includes('OAuth') || errMsg.includes('access token')) {
      errMsg = `Access Token Expired or Invalid (#190): Please check your System User Permanent Access Token in WhatsApp Settings.`;
    }

    return { message: errMsg, code: errCode };
  }

  /**
   * Sends a custom text message via Meta WhatsApp Business Cloud API
   */
  static async sendTextMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    apiVersion?: string;
    recipientPhone: string;
    text: string;
  }): Promise<{
    success: boolean;
    whatsappMessageId?: string;
    rawResponse?: any;
    error?: string;
    errorCode?: string;
  }> {
    const {
      phoneNumberId,
      accessToken,
      apiVersion = 'v21.0',
      recipientPhone,
      text,
    } = params;

    const normalizedRecipient = this.normalizePhoneForWhatsApp(recipientPhone);
    if (!normalizedRecipient || normalizedRecipient.length < 8) {
      return {
        success: false,
        error: 'Invalid recipient phone number. Must include country code without + or spaces (e.g., 919876543210).',
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedRecipient,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    };

    try {
      const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const { message: errMsg, code: errCode } = this.formatMetaErrorMessage(data.error, response.status);
        return {
          success: false,
          error: errMsg,
          errorCode: errCode,
          rawResponse: data,
        };
      }

      const messageId = data.messages?.[0]?.id;
      return {
        success: true,
        whatsappMessageId: messageId,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error executing Meta WhatsApp API call',
      };
    }
  }

  /**
   * Tests the Meta WhatsApp Business API connection by querying the phone number details
   */
  static async testConnection(
    phoneNumberId: string,
    accessToken: string,
    apiVersion: string = 'v21.0'
  ): Promise<MetaTestResult> {
    try {
      const cleanPhoneId = (phoneNumberId || '').trim().replace(/['"]/g, '');
      const cleanToken = (accessToken || '').trim().replace(/['"]/g, '');
      const cleanVersion = (apiVersion || 'v21.0').trim().replace(/['"]/g, '') || 'v21.0';

      if (!cleanPhoneId || !cleanToken) {
        return {
          success: false,
          error: 'Phone Number ID and Access Token must not be empty.',
        };
      }

      const url = `https://graph.facebook.com/${cleanVersion}/${encodeURIComponent(cleanPhoneId)}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Meta Graph API returned an unexpected response (HTTP ${response.status}): ${text.slice(0, 150)}`,
        };
      }

      if (!response.ok || data.error) {
        const metaError = data.error;
        let errorMsg = metaError?.message || `Meta API error (HTTP ${response.status})`;
        if (metaError?.error_user_msg) {
          errorMsg = `${errorMsg} - ${metaError.error_user_msg}`;
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        phoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error connecting to Meta Graph API',
      };
    }
  }

  /**
   * Fetches approved message templates for the WhatsApp Business Account (WABA)
   */
  static async fetchTemplates(
    businessAccountId: string,
    accessToken: string,
    apiVersion: string = 'v21.0'
  ): Promise<{ success: boolean; templates?: MetaRawTemplate[]; error?: string }> {
    try {
      const url = `https://graph.facebook.com/${apiVersion}/${businessAccountId}/message_templates?limit=100`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || `Failed to fetch templates: HTTP ${response.status}`,
        };
      }

      const rawTemplates: MetaRawTemplate[] = data.data || [];
      return {
        success: true,
        templates: rawTemplates,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to fetch templates from Meta Graph API',
      };
    }
  }

  /**
   * Sends an official WhatsApp Template Message via Meta WhatsApp Business Cloud API
   * POST https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages
   */
  static async sendTemplateMessage(params: MetaSendTemplateParams): Promise<{
    success: boolean;
    whatsappMessageId?: string;
    rawResponse?: any;
    error?: string;
    errorCode?: string;
    fellBackToHelloWorld?: boolean;
    fallbackNote?: string;
  }> {
    const {
      phoneNumberId,
      accessToken,
      apiVersion = 'v21.0',
      recipientPhone,
      templateName,
      templateLanguage,
      variables,
      fallbackToHelloWorldIfNotFound = true,
    } = params;

    const normalizedRecipient = this.normalizePhoneForWhatsApp(recipientPhone);
    if (!normalizedRecipient || normalizedRecipient.length < 8) {
      return {
        success: false,
        error: 'Invalid recipient phone number. Must include country code.',
      };
    }

    // Convert variables object { "1": "Rahul", "2": "123" } into Meta's body component parameters
    const sortedKeys = Object.keys(variables)
      .map((k) => parseInt(k, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    const bodyParameters = sortedKeys.map((idx) => ({
      type: 'text',
      text: String(variables[idx] ?? ''),
    }));

    const components: any[] = [];
    // Meta WhatsApp Business API strictly rejects parameters for templates with 0 variables (like hello_world)
    if (bodyParameters.length > 0 && templateName !== 'hello_world') {
      components.push({
        type: 'body',
        parameters: bodyParameters,
      });
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedRecipient,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: templateLanguage,
        },
      },
    };

    if (components.length > 0) {
      payload.template.components = components;
    }

    try {
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const { message: errMsg, code: errCode } = this.formatMetaErrorMessage(data.error, response.status);

        // If template doesn't exist on Meta (#132001) and was not hello_world,
        // automatically fall back to Meta's universal pre-approved 'hello_world' template!
        const isTemplateMissingOnMeta =
          errCode === '132001' ||
          String(data.error?.code) === '132001' ||
          errMsg.includes('132001') ||
          errMsg.toLowerCase().includes('does not exist in the translation');

        if (isTemplateMissingOnMeta && templateName !== 'hello_world' && fallbackToHelloWorldIfNotFound) {
          console.warn(`[WhatsApp] Template '${templateName}' does not exist in Meta account (Error #132001). Attempting automatic fallback to WhatsApp's default approved 'hello_world' template...`);

          const fallbackPayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedRecipient,
            type: 'template',
            template: {
              name: 'hello_world',
              language: {
                code: 'en_US',
              },
            },
          };

          try {
            const fallbackRes = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(fallbackPayload),
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackRes.ok && fallbackData.messages?.[0]?.id) {
              const fallbackMsgId = fallbackData.messages[0].id;
              console.log(`[WhatsApp] Successfully delivered via fallback 'hello_world' template (WAMID: ${fallbackMsgId})`);
              return {
                success: true,
                whatsappMessageId: fallbackMsgId,
                fellBackToHelloWorld: true,
                fallbackNote: `Fell back to WhatsApp's default pre-approved 'hello_world' template because template '${templateName}' is not approved on Meta yet.`,
                rawResponse: fallbackData,
              };
            } else {
              console.warn('[WhatsApp] Fallback hello_world returned error:', fallbackData.error);
            }
          } catch (fbErr: any) {
            console.warn('[WhatsApp] Fallback hello_world request failed:', fbErr?.message);
          }
        }

        return {
          success: false,
          error: errMsg,
          errorCode: errCode,
          rawResponse: data,
        };
      }

      const messageId = data.messages?.[0]?.id;
      return {
        success: true,
        whatsappMessageId: messageId,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error executing Meta WhatsApp API call',
      };
    }
  }
}
