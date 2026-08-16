'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { api, formatDateTime, rupees } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface Invoice {
  number: string;
  issuedOn: string;
  billedTo: { name: string; email: string; phone: string };
  servicedBy?: { name: string; phone: string };
  vehicle: { make: string; model: string; registrationNumber: string };
  service?: string;
  lines: { label: string; amount: number }[];
  total: number;
  paymentStatus: string;
  paymentMethod?: string;
  paidAt?: string;
  qrToken?: string;
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    api<{ invoice: Invoice }>(`/payments/invoice/${id}`).then(async ({ invoice }) => {
      setInvoice(invoice);
      if (invoice.qrToken) {
        // Encodes the verification payload itself, so a scan can be checked
        // against POST /api/bookings/:id/verify-qr without any lookup service.
        const payload = JSON.stringify({ bookingId: id, token: invoice.qrToken });
        setQr(await QRCode.toDataURL(payload, { width: 220, margin: 1 }));
      }
    });
  }, [id]);

  if (!invoice) return <Spinner label="Preparing invoice…" />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between no-print">
        <Link href={`/customer/bookings/${id}`} className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          ← Back to booking
        </Link>
        <button onClick={() => window.print()} className="btn-primary text-sm">
          🖨️ Download PDF
        </button>
      </div>

      <div className="print-area card bg-white p-8 dark:bg-white dark:text-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏍️</span>
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Ride<span className="text-brand-600">Rescue</span>
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              RideRescue Services Pvt Ltd
              <br />
              HITEC City, Hyderabad, Telangana 500081
              <br />
              support@riderescue.in
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-slate-900">TAX INVOICE</h1>
            <p className="mt-1 font-mono text-sm text-slate-600">{invoice.number}</p>
            <p className="mt-1 text-xs text-slate-500">{formatDateTime(invoice.issuedOn)}</p>
            <span
              className={`badge mt-2 ${
                invoice.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {invoice.paymentStatus === 'paid' ? '✓ PAID' : 'UNPAID'}
            </span>
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</p>
            <p className="mt-1.5 font-semibold text-slate-900">{invoice.billedTo.name}</p>
            <p className="text-sm text-slate-600">{invoice.billedTo.phone}</p>
            <p className="text-sm text-slate-600">{invoice.billedTo.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviced by</p>
            <p className="mt-1.5 font-semibold text-slate-900">{invoice.servicedBy?.name || '—'}</p>
            <p className="text-sm text-slate-600">{invoice.servicedBy?.phone}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle</p>
            <p className="mt-1.5 font-semibold text-slate-900">
              {invoice.vehicle.make} {invoice.vehicle.model}
            </p>
            <p className="font-mono text-sm text-slate-600">{invoice.vehicle.registrationNumber}</p>
          </div>
        </div>

        <table className="w-full border-t border-slate-200 text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-3 text-left font-semibold text-slate-700">Description</th>
              <th className="py-3 text-right font-semibold text-slate-700">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-3 text-slate-700">{line.label}</td>
                <td className="py-3 text-right tabular-nums text-slate-900">{rupees(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 text-right font-bold text-slate-900">Total</td>
              <td className="pt-4 text-right text-xl font-extrabold tabular-nums text-slate-900">{rupees(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-slate-200 pt-6">
          <div className="text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Service type: {invoice.service}</p>
            {invoice.paidAt && (
              <p className="mt-1">
                Paid via {invoice.paymentMethod?.toUpperCase()} on {formatDateTime(invoice.paidAt)}
              </p>
            )}
            <p className="mt-3 max-w-sm leading-relaxed">
              This is a computer-generated invoice and is valid without a signature. Spare parts carry the
              manufacturer's warranty from the date of this invoice.
            </p>
          </div>

          {qr && (
            <div className="text-center">
              <img src={qr} alt="Service verification QR code" className="h-28 w-28" />
              <p className="mt-1 text-[10px] text-slate-500">Scan to verify this service record</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
