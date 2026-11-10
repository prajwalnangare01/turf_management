import { store } from './store';
import { Booking, Venue } from '../types/schema';
import { ExcelExportService } from './excelExportService';
import { EmailService } from './emailService';
import { formatDateDDMMYYYY, formatTime12hPlain, formatPhoneNumber } from '../utils/formatters';

export interface ArchiveDispatchResult {
  success: boolean;
  message: string;
  recipient: string;
  bookingsCount: number;
  grossRevenue: number;
  netRevenue: number;
  filename?: string;
  simulated?: boolean;
  periodDescription?: string;
}

export class DataArchiveService {
  /**
   * Filter bookings for a given rolling time window:
   * - 30 days (past 30 days from current date)
   * - 60 days (past 60 days from current date)
   * - undefined / 0 (all-time permanent archive)
   */
  public static getBookingsForPeriod(periodDays?: number): Booking[] {
    const allBookings = store.getBookings();
    if (!periodDays || periodDays <= 0) {
      return [...allBookings].sort((a, b) => b.booking_date.localeCompare(a.booking_date));
    }

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const y = cutoffDate.getFullYear();
    const m = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const d = String(cutoffDate.getDate()).padStart(2, '0');
    const cutoffStr = `${y}-${m}-${d}`;

    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, '0');
    const todayD = String(now.getDate()).padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    return allBookings
      .filter(b => b.booking_date >= cutoffStr && b.booking_date <= todayStr)
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date));
  }

  /**
   * Export and trigger download of Formatted Multi-Sheet Excel XML (.xls)
   */
  public static downloadExcelArchive(periodDays?: number): { success: boolean; filename: string; count: number } {
    const bookings = this.getBookingsForPeriod(periodDays);
    const courts = store.getCourts();
    const customers = store.getCustomers();
    const venue = store.getVenue();

    const todayStr = new Date().toISOString().split('T')[0];
    const periodLabel = periodDays 
      ? `Last ${periodDays} Days (${formatDateDDMMYYYY(new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000))} – ${formatDateDDMMYYYY(new Date())})`
      : 'All-Time Master Archive';

    const xml = ExcelExportService.generateExcelXml(bookings, courts, customers, venue, {
      title: `${venue.name} Data Archive`,
      periodLabel,
      venueName: venue.name
    });

    const fileSuffix = periodDays ? `${periodDays}d` : 'all-time';
    const filename = `${venue.name.toLowerCase().replace(/\s+/g, '-')}-data-archive-${fileSuffix}-${todayStr}.xls`;

    ExcelExportService.triggerDownload(filename, xml, 'application/vnd.ms-excel;charset=utf-8');

    return {
      success: true,
      filename,
      count: bookings.length
    };
  }

  /**
   * Export and trigger download of UTF-8 CSV with BOM (.csv)
   */
  public static downloadCsvArchive(periodDays?: number): { success: boolean; filename: string; count: number } {
    const bookings = this.getBookingsForPeriod(periodDays);
    const courts = store.getCourts();
    const customers = store.getCustomers();
    const venue = store.getVenue();

    const todayStr = new Date().toISOString().split('T')[0];
    const csv = ExcelExportService.generateCsv(bookings, courts, customers);
    const fileSuffix = periodDays ? `${periodDays}d` : 'all-time';
    const filename = `${venue.name.toLowerCase().replace(/\s+/g, '-')}-bookings-${fileSuffix}-${todayStr}.csv`;

    ExcelExportService.triggerDownload(filename, csv, 'text/csv;charset=utf-8;');

    return {
      success: true,
      filename,
      count: bookings.length
    };
  }

  /**
   * Get bookings for the entire previous calendar month.
   * E.g. If current date is November 2026, returns October 1, 2026 to October 31, 2026.
   */
  public static getLastMonthBookings(): {
    bookings: Booking[];
    startDate: Date;
    endDate: Date;
    monthName: string;
    startDateFormatted: string;
    endDateFormatted: string;
  } {
    const now = new Date();
    // First day of previous month
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Last day of previous month (day 0 of current month)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const startY = startOfLastMonth.getFullYear();
    const startM = String(startOfLastMonth.getMonth() + 1).padStart(2, '0');
    const startStr = `${startY}-${startM}-01`;

    const endY = endOfLastMonth.getFullYear();
    const endM = String(endOfLastMonth.getMonth() + 1).padStart(2, '0');
    const endD = String(endOfLastMonth.getDate()).padStart(2, '0');
    const endStr = `${endY}-${endM}-${endD}`;

    const allBookings = store.getBookings();
    const monthBookings = allBookings
      .filter(b => b.booking_date >= startStr && b.booking_date <= endStr)
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date));

    const monthName = startOfLastMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return {
      bookings: monthBookings,
      startDate: startOfLastMonth,
      endDate: endOfLastMonth,
      monthName,
      startDateFormatted: formatDateDDMMYYYY(startOfLastMonth),
      endDateFormatted: formatDateDDMMYYYY(endOfLastMonth)
    };
  }

  /**
   * Calculate the next scheduled automated dispatch date (1st of next month).
   */
  public static getNextScheduledDispatchDate(): Date {
    const now = new Date();
    const settings = (store as any).getDataArchiveSettings();
    const lastDispatchDate = settings.last_dispatch_date ? new Date(settings.last_dispatch_date) : null;
    const alreadyDispatchedToday = lastDispatchDate &&
      lastDispatchDate.getFullYear() === now.getFullYear() &&
      lastDispatchDate.getMonth() === now.getMonth() &&
      lastDispatchDate.getDate() === 1;

    if (now.getDate() === 1 && !alreadyDispatchedToday) {
      return now;
    }
    // 1st of next month
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  /**
   * Send the comprehensive data archive & financial report to the owner's email.
   * Can be called on-demand from Admin Analytics (for either last 30 or 60 days)
   * or automatically on the 1st of every month (for the full previous month).
   */
  public static async dispatchArchiveToOwner(params?: {
    targetEmail?: string;
    periodDays?: number;
    isManual?: boolean;
    isLastMonth?: boolean;
  }): Promise<ArchiveDispatchResult> {
    const isLastMonth = !!params?.isLastMonth;
    const periodDays = params?.periodDays || 30;
    const settings = (store as any).getDataArchiveSettings();
    const venue = store.getVenue();
    const targetEmail = (params?.targetEmail || settings.owner_email || 'owner@turfflow.com').trim();

    let bookings: Booking[];
    let startDateFormatted: string;
    let endDateFormatted: string;
    let monthName: string | undefined;

    if (isLastMonth) {
      const lastMonthData = this.getLastMonthBookings();
      bookings = lastMonthData.bookings;
      startDateFormatted = lastMonthData.startDateFormatted;
      endDateFormatted = lastMonthData.endDateFormatted;
      monthName = lastMonthData.monthName;
    } else {
      bookings = this.getBookingsForPeriod(periodDays);
      const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      startDateFormatted = formatDateDDMMYYYY(startDate);
      endDateFormatted = formatDateDDMMYYYY(new Date());
    }

    const courts = store.getCourts();
    const customers = store.getCustomers();

    // Calculate Summary Metrics
    const totalBookings = bookings.length;
    const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
    const completedCount = bookings.filter(b => b.status === 'completed').length;
    const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
    const refundedCount = bookings.filter(b => b.status === 'refunded').length;

    const grossRevenue = bookings
      .filter(b => b.status === 'confirmed' || b.status === 'completed' || b.status === 'refunded')
      .reduce((sum, b) => sum + (b.total_amount || 0), 0);

    const totalRefunds = bookings
      .filter(b => b.status === 'refunded')
      .reduce((sum, b) => sum + (b.refund_amount || b.total_amount || 0), 0);

    const netRevenue = grossRevenue - totalRefunds;

    const onlineCount = bookings.filter(b => b.source === 'online').length;
    const whatsappCount = bookings.filter(b => b.source === 'offline_whatsapp').length;
    const walkinCount = bookings.filter(b => b.source === 'offline_walkin' || b.source === 'offline_phone').length;

    // Generate the multi-sheet Excel spreadsheet
    const cleanVenueName = (venue.name || 'TurfFlow').replace(/[^a-zA-Z0-9]/g, '_');
    const periodFileLabel = isLastMonth 
      ? (monthName || 'Last_Month').replace(/\s+/g, '_') 
      : `Past_${periodDays}Days`;
    const dateFileLabel = endDateFormatted.replace(/\//g, '-');
    const attachmentFilename = `${cleanVenueName}_Master_Ledger_${periodFileLabel}_${dateFileLabel}.xls`;

    const excelXml = ExcelExportService.generateExcelXml(bookings, courts, customers, venue, {
      title: `${venue.name} Master Ledger`,
      periodLabel: isLastMonth 
        ? `Monthly Archive - ${monthName} (${startDateFormatted} to ${endDateFormatted})` 
        : `Past ${periodDays} Days from Current (${startDateFormatted} to ${endDateFormatted})`,
      venueName: venue.name
    });

    const stringToBase64 = (str: string): string => {
      try {
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(str, 'utf-8').toString('base64');
        }
      } catch {}
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };

    const excelBase64 = stringToBase64(excelXml);

    // Send via EmailService with attached Excel spreadsheet
    const emailRes = await (EmailService as any).sendMonthlyDataArchiveReport({
      toEmail: targetEmail,
      venue,
      periodDays,
      isLastMonth,
      monthName,
      bookings,
      summary: {
        totalBookings,
        grossRevenue,
        totalRefunds,
        netRevenue,
        confirmedCount,
        completedCount,
        cancelledCount,
        refundedCount,
        onlineCount,
        whatsappCount,
        walkinCount
      },
      startDateFormatted,
      endDateFormatted,
      attachments: [
        {
          filename: attachmentFilename,
          content: excelBase64,
          contentType: 'application/vnd.ms-excel'
        }
      ]
    });

    // Update dispatch timestamps
    const nowIso = new Date().toISOString();
    const next1st = this.getNextScheduledDispatchDate();
    const nextIso = next1st.toISOString();

    (store as any).updateDataArchiveSettings({
      last_dispatch_date: nowIso,
      next_dispatch_date: nextIso
    });

    // Log notification
    const notificationLogs = store.getNotificationLogs();
    const logId = isLastMonth ? 'LAST-MONTH' : `${periodDays}D`;
    notificationLogs.unshift({
      id: `notif-archive-${Date.now()}`,
      booking_id: `ARCHIVE-${logId}`,
      channel: 'email',
      type: 'test',
      status: emailRes.success ? 'sent' : 'failed',
      recipient: targetEmail,
      message_preview: `📊 ${isLastMonth ? `Monthly Data Archive (${monthName})` : `Last ${periodDays} Days Data Archive`} dispatched to ${targetEmail} (${totalBookings} records, Net: ₹${netRevenue}) with Excel attachment (${attachmentFilename})`,
      retry_count: 0,
      sent_at: nowIso
    });
    store.setNotificationLogs([...notificationLogs]);

    const periodDescription = isLastMonth 
      ? `last month (${monthName})` 
      : `past ${periodDays} days from current`;

    return {
      success: emailRes.success,
      message: emailRes.success
        ? `Complete ${periodDescription} data backup dispatched to ${targetEmail} with attached Excel file (${attachmentFilename})!${emailRes.simulated ? ' (Sandbox Simulation)' : ''}`
        : (emailRes.error || `Failed to dispatch data archive email to ${targetEmail}`),
      recipient: targetEmail,
      bookingsCount: totalBookings,
      grossRevenue,
      netRevenue,
      filename: attachmentFilename,
      simulated: !!emailRes.simulated,
      periodDescription
    };
  }

  /**
   * Automated check called by ReminderScheduler.
   * Dispatches automatically on the 1st of every month sending the full previous month's data,
   * or when 30+ days have elapsed since the last dispatch.
   */
  public static async checkAndDispatchAutomatedMonthlyArchive(): Promise<{
    dispatched: boolean;
    reason?: string;
    recipient?: string;
  }> {
    const settings = (store as any).getDataArchiveSettings();
    if (!settings.is_active) {
      return { dispatched: false, reason: 'Automated monthly archival is disabled in settings' };
    }

    const now = new Date();
    const isFirstOfMonth = now.getDate() === 1;

    // Check if already dispatched for this month's 1st run
    const lastDispatchDate = settings.last_dispatch_date ? new Date(settings.last_dispatch_date) : null;
    const alreadyDispatchedToday = lastDispatchDate &&
      lastDispatchDate.getFullYear() === now.getFullYear() &&
      lastDispatchDate.getMonth() === now.getMonth() &&
      lastDispatchDate.getDate() === 1;

    const diffDays = lastDispatchDate 
      ? (now.getTime() - lastDispatchDate.getTime()) / (1000 * 60 * 60 * 24) 
      : 999;

    // Trigger if today is the 1st of the month and not yet dispatched, or if 30+ days elapsed
    if ((isFirstOfMonth && !alreadyDispatchedToday) || diffDays >= 30) {
      console.info(`[DataArchiveService] 📅 1st of month schedule trigger (day: ${now.getDate()}, diffDays: ${diffDays.toFixed(1)}). Dispatching previous month data to owner...`);
      const res = await this.dispatchArchiveToOwner({
        targetEmail: settings.owner_email,
        isLastMonth: true,
        isManual: false
      });
      return {
        dispatched: res.success,
        recipient: settings.owner_email,
        reason: `Dispatched automated 1st-of-month archive for last month (${res.bookingsCount} bookings, ₹${res.netRevenue} net revenue)`
      };
    }

    const next1st = this.getNextScheduledDispatchDate();
    return {
      dispatched: false,
      reason: `Next scheduled dispatch on 1st of next month (${formatDateDDMMYYYY(next1st)})`
    };
  }
}
