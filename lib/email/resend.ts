import { Resend } from 'resend'
import { PLATFORM_NAME } from '@/lib/brand'

function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null
  return new Resend(apiKey)
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  `${PLATFORM_NAME} <onboarding@resend.dev>`

async function sendHtmlEmail(input: {
  to: string
  subject: string
  html: string
  devLog?: string[]
}): Promise<{ devMode: boolean }> {
  const resend = getResend()

  if (!resend) {
    console.warn(`[dev] RESEND_API_KEY missing — email not sent (${input.subject})`)
    for (const line of input.devLog ?? []) {
      console.warn(`[dev] ${line}`)
    }
    return { devMode: true }
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error('Unable to send email. Please try again later.')
  }

  return { devMode: false }
}

export async function sendClientOtpEmail(input: {
  to: string
  clientName: string
  otp: string
  portalUrl: string
  firmName: string
}): Promise<{ devMode: boolean }> {
  const { to, clientName, otp, portalUrl, firmName } = input
  const firm = escapeHtml(firmName.trim() || 'your CPA firm')
  const safeName = escapeHtml(clientName)

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 22px; margin-bottom: 8px;">Secure access to ${firm}</h1>
      <p style="color: #666; line-height: 1.6;">Hi ${safeName}, <strong>${firm}</strong> invited you to upload tax documents securely.</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #0061FF; margin: 24px 0;">${otp}</p>
      <p style="color: #666; line-height: 1.6;">This code expires in 30 days. You can also open your portal directly:</p>
      <p><a href="${portalUrl}" style="display: inline-block; background: #0061FF; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Open ${firm} portal</a></p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">If you did not expect this email, you can ignore it.</p>
      <p style="color: #bbb; font-size: 11px; margin-top: 16px;">Powered by ${PLATFORM_NAME}</p>
    </div>
  `

  return sendHtmlEmail({
    to,
    subject: `Your access code from ${firmName.trim() || 'your CPA firm'}`,
    html,
    devLog: [`Portal URL: ${portalUrl}`, `OTP for ${to}: ${otp}`, `Firm: ${firmName}`],
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function sendCpaVerificationEmail(input: {
  to: string
  firmName: string
  confirmUrl: string
}): Promise<{ devMode: boolean }> {
  const { to, firmName, confirmUrl } = input

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 22px; margin-bottom: 8px;">Confirm your ${PLATFORM_NAME} account</h1>
      <p style="color: #666; line-height: 1.6;">
        Thanks for registering <strong>${firmName}</strong>. Confirm your email to finish setting up your firm.
      </p>
      <p style="margin: 28px 0;">
        <a href="${confirmUrl}" style="display: inline-block; background: #0061FF; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
          Verify email
        </a>
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">If you did not create this account, you can ignore this email.</p>
    </div>
  `

  return sendHtmlEmail({
    to,
    subject: `Verify your email for ${PLATFORM_NAME}`,
    html,
    devLog: [`CPA verify URL for ${to}: ${confirmUrl}`],
  })
}

export async function sendFirmInviteEmail(input: {
  to: string
  firmName: string
  inviterEmail: string
  role: string
  inviteUrl: string
}): Promise<{ devMode: boolean }> {
  const { to, firmName, inviterEmail, role, inviteUrl } = input

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 22px; margin-bottom: 8px;">Join ${firmName} on ${PLATFORM_NAME}</h1>
      <p style="color: #666; line-height: 1.6;">
        ${inviterEmail} invited you to join <strong>${firmName}</strong> as <strong>${role}</strong>.
      </p>
      <p style="margin: 28px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: #0061FF; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
          Accept invite
        </a>
      </p>
      <p style="color: #666; line-height: 1.6;">This invite expires in 7 days.</p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">If you were not expecting this, you can ignore this email.</p>
    </div>
  `

  return sendHtmlEmail({
    to,
    subject: `You're invited to ${firmName} on ${PLATFORM_NAME}`,
    html,
    devLog: [`Firm invite URL for ${to}: ${inviteUrl}`],
  })
}
