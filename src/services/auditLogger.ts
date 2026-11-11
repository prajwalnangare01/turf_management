import { store } from './store';
import { AuditLog } from '../types/schema';

export class AuditLogger {
  /**
   * 60-day operational retention window in milliseconds
   */
  public static RETENTION_DAYS = 60;
  public static RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

  public static log(
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue?: any,
    newValue?: any
  ): AuditLog {
    const adminUsers = store.getAdminUsers();
    const admin = adminUsers.find(a => a.id === adminId);
    let adminName = admin?.name;
    if (!adminName) {
      if (adminId === 'SYSTEM') adminName = 'System Automation';
      else if (adminId.startsWith('adm-')) adminName = 'Staff / Manager';
      else adminName = 'Venue Operations';
    }

    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      admin_user_id: adminId,
      admin_name: adminName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value: oldValue,
      new_value: newValue,
      created_at: new Date().toISOString()
    };

    const logs = store.getAuditLogs();
    logs.unshift(log);

    // Automatically prune records older than 60 days to keep database storage clean & optimal
    const cutoffTime = Date.now() - this.RETENTION_MS;
    const prunedLogs = logs.filter(l => {
      const t = new Date(l.created_at).getTime();
      return !isNaN(t) && t >= cutoffTime;
    });

    store.setAuditLogs(prunedLogs);
    return log;
  }

  /**
   * Filter and return audit logs strictly from the last 60 days
   */
  public static getLogsLast60Days(): AuditLog[] {
    const cutoffTime = Date.now() - this.RETENTION_MS;
    return store.getAuditLogs()
      .filter(l => {
        const t = new Date(l.created_at).getTime();
        return !isNaN(t) && t >= cutoffTime;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Explicit maintenance utility to purge records older than 60 days
   */
  public static purgeRecordsOlderThan60Days(): number {
    const cutoffTime = Date.now() - this.RETENTION_MS;
    const logs = store.getAuditLogs();
    const active = logs.filter(l => new Date(l.created_at).getTime() >= cutoffTime);
    const purgedCount = logs.length - active.length;
    if (purgedCount > 0) {
      store.setAuditLogs(active);
    }
    return purgedCount;
  }
}
