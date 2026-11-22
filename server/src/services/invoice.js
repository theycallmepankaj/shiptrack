import PDFDocument from 'pdfkit';

// FR-14: invoice PDF, generated on demand from the shipment (so it always matches the record).
// PDFKit's built-in fonts have no ₹ glyph, so amounts are written "Rs." on the PDF.

const NAVY = '#0B1220';
const MUTED = '#64748B';
const ORANGE = '#FF6B2C';
const LINE = '#E5E7EB';
const IST = { timeZone: 'Asia/Kolkata' };

export const invoiceNumber = (s) => `INV-${s.trackingId.replace(/^SHP-/, '')}`;
const rs = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...IST }) : '—');
const dateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', ...IST }) : '—');

/** Line items; a rounding line makes them add up to the whole-rupee total exactly. */
export function invoiceLines(s) {
  const p = s.price;
  const lines = [
    { label: 'Base fare', amount: p.base },
    { label: `Distance (${s.distanceKm} km)`, amount: p.distanceCharge },
    { label: `Weight (${p.chargeableWeightKg ?? s.package.weightKg} kg chargeable)`, amount: p.weightCharge },
  ];
  if (p.speedCharge) lines.push({ label: 'Express delivery', amount: p.speedCharge });
  const sum = Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100;
  const rounding = Math.round((p.total - sum) * 100) / 100;
  if (rounding) lines.push({ label: 'Rounding', amount: rounding });
  return lines;
}

/** Renders the invoice and resolves with the PDF bytes. */
export function renderInvoice(s, customer) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `ShipTrack invoice ${invoiceNumber(s)}`, Author: 'ShipTrack' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 100;
    const left = 50;

    // Header
    doc.roundedRect(left, 50, 28, 28, 7).fill(ORANGE);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('ShipTrack', left + 38, 55);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Courier & parcel delivery', left + 38, 75);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text('Invoice', left, 52, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`${invoiceNumber(s)}  ·  ${date(s.payment?.paidAt ?? s.createdAt)}`, left, 78, { width: W, align: 'right' });
    doc.moveTo(left, 105).lineTo(left + W, 105).strokeColor(LINE).stroke();

    // Billed to / shipment
    const col = (x, y, title, rows) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(title.toUpperCase(), x, y, { characterSpacing: 0.8 });
      let yy = y + 14;
      for (const [text, opts = {}] of rows) {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 10).fillColor(opts.muted ? MUTED : NAVY).text(text, x, yy, { width: W / 2 - 15 });
        yy = doc.y + 2;
      }
      return yy;
    };
    const y1 = col(left, 122, 'Billed to', [[customer?.name ?? 'Customer', { bold: true }], [customer?.email ?? '', { muted: true }], [customer?.phone ?? '', { muted: true }]]);
    const y2 = col(left + W / 2 + 15, 122, 'Shipment', [
      [s.trackingId, { bold: true, size: 12 }],
      [`${s.speed === 'express' ? 'Express' : 'Standard'} · ${s.package.type ?? 'parcel'} · ${s.package.weightKg} kg`, { muted: true }],
      [`Booked ${dateTime(s.createdAt)}`, { muted: true }],
    ]);
    let y = Math.max(y1, y2) + 14;
    const stop = (label, st) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), left, y, { characterSpacing: 0.8 });
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text([st.address, st.city].filter(Boolean).join(', '), left + 60, y - 1, { width: W - 60 });
      y = doc.y + 8;
    };
    stop('From', s.pickup);
    stop('To', s.drop);

    // Line items
    y += 10;
    doc.rect(left, y, W, 24).fill('#F8FAFC');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('DESCRIPTION', left + 12, y + 8).text('AMOUNT', left, y + 8, { width: W - 12, align: 'right' });
    y += 24;
    for (const l of invoiceLines(s)) {
      doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(l.label, left + 12, y + 9).text(rs(l.amount), left, y + 9, { width: W - 12, align: 'right' });
      y += 28;
      doc.moveTo(left, y).lineTo(left + W, y).strokeColor(LINE).stroke();
    }
    y += 12;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Total', left + 12, y).text(rs(s.price.total), left, y, { width: W - 12, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Inclusive of all applicable taxes.', left + 12, y + 18);

    // Payment
    y += 50;
    const pay = s.payment ?? {};
    const status = pay.status === 'refunded' ? `Refunded${pay.refundedAt ? ` on ${date(pay.refundedAt)}` : ''}` : pay.status === 'paid' ? 'Paid' : 'Not paid';
    const provider = pay.provider === 'razorpay' ? 'Razorpay (test mode)' : pay.provider === 'mock' ? 'Test checkout (development)' : pay.provider;
    col(left, y, 'Payment', [
      [status, { bold: true, size: 11 }],
      [[provider, pay.method].filter(Boolean).join(' · '), { muted: true }],
      [pay.paymentId ? `Payment ID ${pay.paymentId}` : '', { muted: true }],
      [pay.paidAt ? `Paid ${dateTime(pay.paidAt)}` : '', { muted: true }],
    ]);
    if (pay.status === 'refunded') {
      doc.save().rotate(-12, { origin: [left + W - 80, y + 30] });
      doc.roundedRect(left + W - 150, y + 10, 140, 40, 6).lineWidth(2).strokeColor('#DC2626').stroke();
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#DC2626').text('REFUNDED', left + W - 150, y + 21, { width: 140, align: 'center' });
      doc.restore();
    }

    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('This is a computer-generated invoice and needs no signature. Questions? Reply to your booking email.', left, doc.page.height - 80, { width: W, align: 'center' });
    doc.end();
  });
}
