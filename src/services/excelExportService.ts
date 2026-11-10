import { Booking, Court, Customer, Venue } from '../types/schema';
import { formatDateDDMMYYYY, formatTime12hPlain, formatPhoneNumber, getBookingGatePassOtp, getBookingGroupRef } from '../utils/formatters';

export interface ExcelWorkbookOptions {
  title?: string;
  periodLabel?: string;
  venueName?: string;
}

export class ExcelExportService {
  /**
   * Escape XML special characters
   */
  private static escapeXml(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Escape CSV field (RFC 4180)
   */
  private static escapeCsv(field: any): string {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  }

  /**
   * Generate Microsoft Excel XML Spreadsheet 2003 (.xls)
   * This is a native, styled multi-sheet XML workbook supported by Microsoft Excel,
   * Apple Numbers, Google Sheets, and LibreOffice with zero external dependencies.
   */
  public static generateExcelXml(
    bookings: Booking[],
    courts: Court[],
    customers: Customer[],
    venue?: Venue,
    options: ExcelWorkbookOptions = {}
  ): string {
    const venueName = options.venueName || venue?.name || 'TurfFlow Arena';
    const periodLabel = options.periodLabel || 'All-Time Complete Archive';
    const generatedDate = formatDateDDMMYYYY(new Date());

    // 1. Calculate KPI Metrics
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

    // 2. Channel Metrics
    const onlineCount = bookings.filter(b => b.source === 'online').length;
    const whatsappCount = bookings.filter(b => b.source === 'offline_whatsapp').length;
    const walkinCount = bookings.filter(b => b.source === 'offline_walkin' || b.source === 'offline_phone').length;

    // Build XML Content
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${this.escapeXml(venueName)} - Booking &amp; Revenue Archive</Title>
  <Subject>Venue Operations &amp; Ledger Report</Subject>
  <Author>${this.escapeXml(venueName)}</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Color="#1F2937"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <!-- Main Header Style -->
  <Style ss:ID="HeaderTitle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#0F5132"/>
  </Style>
  <Style ss:ID="SubHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Italic="1" ss:Color="#6B7280"/>
  </Style>
  <!-- Table Column Header -->
  <Style ss:ID="TableHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F5132"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F5132"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#107C41" ss:Pattern="Solid"/>
  </Style>
  <!-- Normal Cells -->
  <Style ss:ID="CellNormal">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
  </Style>
  <Style ss:ID="CellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
  </Style>
  <Style ss:ID="CellCurrency">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Bold="1"/>
   <NumberFormat ss:Format="&quot;₹&quot;#,##0"/>
  </Style>
  <Style ss:ID="StatusConfirmed">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Color="#0F5132"/>
   <Interior ss:Color="#D1E7DD" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="StatusCompleted">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Color="#084298"/>
   <Interior ss:Color="#CFE2FF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="StatusCancelled">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Color="#842029"/>
   <Interior ss:Color="#F8D7DA" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="StatusRefunded">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Color="#664D03"/>
   <Interior ss:Color="#FFF3CD" ss:Pattern="Solid"/>
  </Style>
  <!-- KPI Styles -->
  <Style ss:ID="KpiCard">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
   </Borders>
   <Interior ss:Color="#F9FAFB" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="KpiLabel">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Bold="1" ss:Color="#4B5563"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="KpiValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="KpiRevenueValue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#0F5132"/>
   <Interior ss:Color="#D1E7DD" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="&quot;₹&quot;#,##0"/>
  </Style>
 </Styles>

 <!-- ============================================================== -->
 <!-- WORKSHEET 1: COMPLETE BOOKING LEDGER                           -->
 <!-- ============================================================== -->
 <Worksheet ss:Name="Booking Ledger">
  <Table ss:ExpandedColumnCount="22" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="20">
   <Column ss:Width="130"/> <!-- Booking Ref -->
   <Column ss:Width="130"/> <!-- Group Ref -->
   <Column ss:Width="95"/>  <!-- Status -->
   <Column ss:Width="85"/>  <!-- Match Date -->
   <Column ss:Width="80"/>  <!-- Day -->
   <Column ss:Width="135"/> <!-- Slot Timing -->
   <Column ss:Width="180"/> <!-- Pitch / Court -->
   <Column ss:Width="75"/>  <!-- Sport -->
   <Column ss:Width="130"/> <!-- Customer Name -->
   <Column ss:Width="105"/> <!-- Customer Phone -->
   <Column ss:Width="160"/> <!-- Customer Email -->
   <Column ss:Width="80"/>  <!-- Gate OTP -->
   <Column ss:Width="95"/>  <!-- Channel -->
   <Column ss:Width="90"/>  <!-- Amount -->
   <Column ss:Width="80"/>  <!-- Discount -->
   <Column ss:Width="80"/>  <!-- Refund -->
   <Column ss:Width="120"/> <!-- Payment ID -->
   <Column ss:Width="85"/>  <!-- Pay Status -->
   <Column ss:Width="85"/>  <!-- Notice (h) -->
   <Column ss:Width="75"/>  <!-- Met Terms -->
   <Column ss:Width="200"/> <!-- Cancel Reason -->
   <Column ss:Width="130"/> <!-- Booked At -->

   <!-- Title Row -->
   <Row ss:Height="28">
    <Cell ss:MergeAcross="21" ss:StyleID="HeaderTitle">
     <Data ss:Type="String">${this.escapeXml(venueName)} — Master Booking Ledger Archive</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="21" ss:StyleID="SubHeader">
     <Data ss:Type="String">Period: ${this.escapeXml(periodLabel)} | Export Generated: ${generatedDate} | Total Records: ${totalBookings}</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <!-- Table Headers -->
   <Row ss:Height="24">
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Booking Reference</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Group Reference</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Match Date</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Day</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Slot Timing</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Pitch / Court</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Sport</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Customer Name</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Mobile (+91)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Email Address</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Gate Pass OTP</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Booking Source</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Slot Amount (₹)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Discount (₹)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Refund (₹)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Payment ID</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Payment Status</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Notice Hours</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Met Terms</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Cancellation Reason / Notes</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Booked At</Data></Cell>
   </Row>

   <!-- Booking Data Rows -->
   ${bookings.map(b => {
     const cust = customers.find(c => c.id === b.customer_id);
     const court = courts.find(c => c.id === b.court_id);
     const groupRef = b.group_ref || getBookingGroupRef(b);
     const otpCode = getBookingGatePassOtp(b);
     const matchDate = formatDateDDMMYYYY(b.booking_date);
     
     // Day of week
     let dayName = '';
     try {
       const [y, m, d] = b.booking_date.split('-').map(Number);
       const dObj = new Date(y, m - 1, d);
       dayName = dObj.toLocaleDateString('en-IN', { weekday: 'short' });
     } catch (_) {}

     const slotTiming = `${formatTime12hPlain(b.start_time)} – ${formatTime12hPlain(b.end_time)}`;
     const customerName = cust?.name || b.customer_name || 'Player';
     const customerPhone = formatPhoneNumber(cust?.phone || b.customer_phone || '');
     const customerEmail = cust?.email || (b as any).customer_email || '—';

     let statusStyle = 'CellCenter';
     if (b.status === 'confirmed') statusStyle = 'StatusConfirmed';
     else if (b.status === 'completed') statusStyle = 'StatusCompleted';
     else if (b.status === 'cancelled') statusStyle = 'StatusCancelled';
     else if (b.status === 'refunded') statusStyle = 'StatusRefunded';

     let sourceLabel = 'Website (Online)';
     if (b.source === 'offline_whatsapp') sourceLabel = 'WhatsApp Bot';
     else if (b.source === 'offline_walkin') sourceLabel = 'Walk-in (Counter)';
     else if (b.source === 'offline_phone') sourceLabel = 'Phone Booking';

     const noticeHoursStr = b.cancellation_notice_hours != null ? `${b.cancellation_notice_hours.toFixed(1)}h` : '—';
     const metTermsStr = b.cancellation_met_terms != null ? (b.cancellation_met_terms ? 'Yes' : 'No') : '—';
     const cancelReasonStr = b.refund_reason || '—';
     const createdAtStr = b.created_at ? formatDateDDMMYYYY(b.created_at) : matchDate;

     return `
   <Row ss:Height="20">
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(b.booking_ref || b.id)}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(groupRef)}</Data></Cell>
    <Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${this.escapeXml(b.status.toUpperCase())}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${matchDate}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${dayName}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml(slotTiming)}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(court?.name || 'Pitch')}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml(court?.sport_ids?.join('/') || 'Football')}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(customerName)}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(customerPhone)}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(customerEmail)}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml(otpCode)}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(sourceLabel)}</Data></Cell>
    <Cell ss:StyleID="CellCurrency"><Data ss:Type="Number">${b.total_amount || 0}</Data></Cell>
    <Cell ss:StyleID="CellCurrency"><Data ss:Type="Number">${b.discount_amount || 0}</Data></Cell>
    <Cell ss:StyleID="CellCurrency"><Data ss:Type="Number">${b.refund_amount || 0}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(b.gateway_payment_id || '—')}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml((b as any).payment_status || 'captured')}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml(noticeHoursStr)}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml(metTermsStr)}</Data></Cell>
    <Cell ss:StyleID="CellNormal"><Data ss:Type="String">${this.escapeXml(cancelReasonStr)}</Data></Cell>
    <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${this.escapeXml(createdAtStr)}</Data></Cell>
   </Row>`;
   }).join('')}
  </Table>
 </Worksheet>

 <!-- ============================================================== -->
 <!-- WORKSHEET 2: EXECUTIVE REVENUE & AUDIT SUMMARY                 -->
 <!-- ============================================================== -->
 <Worksheet ss:Name="Executive Summary">
  <Table ss:ExpandedColumnCount="6" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="22">
   <Column ss:Width="200"/>
   <Column ss:Width="140"/>
   <Column ss:Width="30"/>
   <Column ss:Width="180"/>
   <Column ss:Width="140"/>

   <Row ss:Height="26">
    <Cell ss:MergeAcross="4" ss:StyleID="HeaderTitle">
     <Data ss:Type="String">${this.escapeXml(venueName)} — Executive Financial Summary</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="4" ss:StyleID="SubHeader">
     <Data ss:Type="String">Period: ${this.escapeXml(periodLabel)} | GST: ${this.escapeXml(venue?.gst_number || '29ABCDE1234F1Z5')} | Phone: ${this.escapeXml(venue?.contact_phone || '+91 95791 58374')}</Data>
    </Cell>
   </Row>
   <Row ss:Height="12"/>

   <!-- Revenue Table Header -->
   <Row ss:Height="22">
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Financial Metric</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Amount (INR)</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Booking Volume Metric</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Count</Data></Cell>
   </Row>

   <!-- Metric Row 1 -->
   <Row ss:Height="22">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Gross Revenue Captured</Data></Cell>
    <Cell ss:StyleID="CellCurrency"><Data ss:Type="Number">${grossRevenue}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Total Bookings Recorded</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${totalBookings}</Data></Cell>
   </Row>

   <!-- Metric Row 2 -->
   <Row ss:Height="22">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Total Customer Refunds Paid</Data></Cell>
    <Cell ss:StyleID="CellCurrency"><Data ss:Type="Number">${totalRefunds}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Active Confirmed Sessions</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${confirmedCount}</Data></Cell>
   </Row>

   <!-- Metric Row 3 -->
   <Row ss:Height="24">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Net Retained Venue Revenue</Data></Cell>
    <Cell ss:StyleID="KpiRevenueValue"><Data ss:Type="Number">${netRevenue}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Completed (Played) Matches</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${completedCount}</Data></Cell>
   </Row>

   <!-- Metric Row 4 -->
   <Row ss:Height="22">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Average Revenue Per Session</Data></Cell>
    <Cell ss:StyleID="CellCurrency"><Data ss:Type="Number">${confirmedCount + completedCount > 0 ? Math.round(netRevenue / (confirmedCount + completedCount)) : 0}</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Cancelled Reservations</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${cancelledCount}</Data></Cell>
   </Row>

   <!-- Metric Row 5 -->
   <Row ss:Height="22">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Total Cancellation Rate</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="String">${totalBookings > 0 ? ((cancelledCount + refundedCount) / totalBookings * 100).toFixed(1) : 0}%</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Refunded Reservations</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${refundedCount}</Data></Cell>
   </Row>

   <Row ss:Height="16"/>

   <!-- Channel Breakdown Section -->
   <Row ss:Height="22">
    <Cell ss:MergeAcross="1" ss:StyleID="TableHeader"><Data ss:Type="String">Booking Channel Distribution</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:MergeAcross="1" ss:StyleID="TableHeader"><Data ss:Type="String">Pitch Occupancy Breakdown</Data></Cell>
   </Row>

   <Row ss:Height="20">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Website Online Checkout</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="String">${onlineCount} bookings (${totalBookings > 0 ? (onlineCount / totalBookings * 100).toFixed(0) : 0}%)</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">${this.escapeXml(courts[0]?.name || 'Pitch 1')}</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${bookings.filter(b => b.court_id === courts[0]?.id).length}</Data></Cell>
   </Row>

   <Row ss:Height="20">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">WhatsApp Automation Bot</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="String">${whatsappCount} bookings (${totalBookings > 0 ? (whatsappCount / totalBookings * 100).toFixed(0) : 0}%)</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">${this.escapeXml(courts[1]?.name || 'Pitch 2')}</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${bookings.filter(b => b.court_id === courts[1]?.id).length}</Data></Cell>
   </Row>

   <Row ss:Height="20">
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">FrontDesk Walk-in / Phone</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="String">${walkinCount} bookings (${totalBookings > 0 ? (walkinCount / totalBookings * 100).toFixed(0) : 0}%)</Data></Cell>
    <Cell ss:StyleID="Default"/>
    <Cell ss:StyleID="KpiLabel"><Data ss:Type="String">Total Pitches Configured</Data></Cell>
    <Cell ss:StyleID="KpiValue"><Data ss:Type="Number">${courts.length}</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    return xml;
  }

  /**
   * Generate RFC 4180 UTF-8 CSV with BOM (\uFEFF)
   * Opens cleanly in Microsoft Excel, Google Sheets, LibreOffice, and Tally ERP
   */
  public static generateCsv(
    bookings: Booking[],
    courts: Court[],
    customers: Customer[]
  ): string {
    const headers = [
      'Booking Reference',
      'Group Reference',
      'Status',
      'Match Date (DD/MM/YYYY)',
      'Slot Timing',
      'Court / Pitch Name',
      'Sport',
      'Customer Name',
      'Customer Mobile',
      'Customer Email',
      'Gate Pass OTP',
      'Source Channel',
      'Total Amount (INR)',
      'Discount (INR)',
      'Refund (INR)',
      'Payment ID',
      'Payment Status',
      'Notice Hours',
      'Met Cancellation Terms',
      'Cancellation Reason',
      'Booked At'
    ];

    const rows = bookings.map(b => {
      const cust = customers.find(c => c.id === b.customer_id);
      const court = courts.find(c => c.id === b.court_id);
      const groupRef = b.group_ref || getBookingGroupRef(b);
      const otpCode = getBookingGatePassOtp(b);
      const matchDate = formatDateDDMMYYYY(b.booking_date);
      const slotTiming = `${formatTime12hPlain(b.start_time)} - ${formatTime12hPlain(b.end_time)}`;
      const customerName = cust?.name || b.customer_name || 'Player';
      const customerPhone = formatPhoneNumber(cust?.phone || b.customer_phone || '');
      const customerEmail = cust?.email || (b as any).customer_email || '';

      let sourceLabel = 'Website (Online)';
      if (b.source === 'offline_whatsapp') sourceLabel = 'WhatsApp Bot';
      else if (b.source === 'offline_walkin') sourceLabel = 'Walk-in (Counter)';
      else if (b.source === 'offline_phone') sourceLabel = 'Phone Booking';

      const noticeHoursStr = b.cancellation_notice_hours != null ? `${b.cancellation_notice_hours.toFixed(1)}h` : '';
      const metTermsStr = b.cancellation_met_terms != null ? (b.cancellation_met_terms ? 'Yes' : 'No') : '';
      const cancelReasonStr = b.refund_reason || '';
      const createdAtStr = b.created_at ? formatDateDDMMYYYY(b.created_at) : matchDate;

      return [
        this.escapeCsv(b.booking_ref || b.id),
        this.escapeCsv(groupRef),
        this.escapeCsv(b.status.toUpperCase()),
        this.escapeCsv(matchDate),
        this.escapeCsv(slotTiming),
        this.escapeCsv(court?.name || 'Pitch'),
        this.escapeCsv(court?.sport_ids?.join('/') || 'Football'),
        this.escapeCsv(customerName),
        this.escapeCsv(customerPhone),
        this.escapeCsv(customerEmail),
        this.escapeCsv(otpCode),
        this.escapeCsv(sourceLabel),
        this.escapeCsv(b.total_amount || 0),
        this.escapeCsv(b.discount_amount || 0),
        this.escapeCsv(b.refund_amount || 0),
        this.escapeCsv(b.gateway_payment_id || ''),
        this.escapeCsv((b as any).payment_status || 'captured'),
        this.escapeCsv(noticeHoursStr),
        this.escapeCsv(metTermsStr),
        this.escapeCsv(cancelReasonStr),
        this.escapeCsv(createdAtStr)
      ].join(',');
    });

    // Add UTF-8 BOM so Excel opens with proper Indian Rupee / Unicode support
    return '\uFEFF' + [headers.map(h => this.escapeCsv(h)).join(','), ...rows].join('\r\n');
  }

  /**
   * Browser file download helper
   */
  public static triggerDownload(filename: string, content: string, mimeType: string): void {
    if (typeof window === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
