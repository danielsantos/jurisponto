const senderName = process.env.EMAIL_FROM_NAME || 'Rota do Caso';
const senderAddress = process.env.EMAIL_FROM || 'contato@rotadocaso.local';
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

async function deliverEmail({ to, subject, html, text, developmentCode }) {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${senderName} <${senderAddress}>`, to: [to], subject, html, text })
    });
    if (!response.ok) throw new Error('O provedor de e-mail recusou o envio.');
    return { mode: 'resend' };
  }

  console.log(`\n[E-MAIL DE TESTE] Para: ${to}\nAssunto: ${subject}\n${developmentCode ? `Código: ${developmentCode}\n` : ''}Conteúdo: ${text}\n`);
  return { mode: 'development', code: developmentCode };
}

async function sendVerificationEmail({ to, name, code }) {
  const safeName = escapeHtml(name);
  return deliverEmail({
    to,
    subject: 'Confirme seu e-mail na Rota do Caso',
    developmentCode: code,
    text: `Olá, ${name}. Seu código de confirmação da Rota do Caso é ${code}. Ele expira em 15 minutos.`,
    html: `<p>Olá, ${safeName}.</p><p>Seu código de confirmação da Rota do Caso é:</p><h1 style="letter-spacing:4px">${code}</h1><p>Ele expira em 15 minutos.</p>`
  });
}

async function sendPasswordResetEmail({ to, name, code }) {
  const safeName = escapeHtml(name);
  return deliverEmail({
    to,
    subject: 'Redefina sua senha da Rota do Caso',
    developmentCode: code,
    text: `Olá, ${name}. Seu código para redefinir a senha da Rota do Caso é ${code}. Ele expira em 15 minutos.`,
    html: `<p>Olá, ${safeName}.</p><p>Seu código para redefinir a senha da Rota do Caso é:</p><h1 style="letter-spacing:4px">${code}</h1><p>Ele expira em 15 minutos.</p>`
  });
}

async function sendDocumentRequestEmail({ to, clientName, documentName, caseTitle, uploadUrl, kind = 'request', note = '' }) {
  const safeClientName = escapeHtml(clientName);
  const safeDocumentName = escapeHtml(documentName);
  const safeCaseTitle = escapeHtml(caseTitle);
  const safeUploadUrl = escapeHtml(uploadUrl);
  const safeNote = escapeHtml(note);
  const copy = kind === 'reminder'
    ? 'Este é um lembrete sobre um documento que ainda aguardamos.'
    : kind === 'resend'
      ? 'O arquivo enviado precisa ser reenviado.'
      : 'Precisamos de um documento para dar continuidade ao seu atendimento.';
  const noteBlock = safeNote ? `\n\nObservação da equipe: ${note}` : '';

  return deliverEmail({
    to,
    subject: `${kind === 'reminder' ? 'Lembrete: ' : kind === 'resend' ? 'Reenvio solicitado: ' : 'Documento solicitado: '}${documentName}`,
    text: `Olá, ${clientName}. ${copy}\n\nDocumento: ${documentName}\nCaso: ${caseTitle}${noteBlock}\n\nEnvie o arquivo com segurança por este link: ${uploadUrl}\n\nO link é pessoal, de uso único e expira em 7 dias.`,
    html: `<p>Olá, ${safeClientName}.</p><p>${copy}</p><p><strong>Documento:</strong> ${safeDocumentName}<br /><strong>Caso:</strong> ${safeCaseTitle}</p>${safeNote ? `<p><strong>Observação da equipe:</strong> ${safeNote}</p>` : ''}<p><a href="${safeUploadUrl}" style="display:inline-block;padding:12px 18px;background:#17263d;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Enviar documento</a></p><p>Para sua segurança, este link é pessoal, de uso único e expira em 7 dias.</p>`
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendDocumentRequestEmail };
