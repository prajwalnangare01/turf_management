import { store } from './store';
import { AuditLog } from '../types/schema';

export class AuditLogger {
  public static log(
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue?: any,
    newValue?: any
  ) {
    const adminUsers = store.getAdminUsers();
    const admin = adminUsers.find(a => a.id === adminId);
    const adminName = admin?.name || 'System Admin';

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
    store.setAuditLogs(logs);
  }
}
