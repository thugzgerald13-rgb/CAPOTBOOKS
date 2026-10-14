import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  actionPermissionKey,
  dropdownPermissionKey,
  modulePermissionKey,
} from './granularPermissions';

/**
 * Shared client-side permission helpers for module screens.
 * These checks only control presentation and guard handlers; database/API
 * operations must still be protected by the Supabase policies/RPCs.
 */
export function useGranularPermissions(moduleId: string) {
  const { hasPermission } = useAuth();
  const moduleKey = useMemo(() => modulePermissionKey(moduleId), [moduleId]);
  const canView = hasPermission(moduleKey) && hasPermission(actionPermissionKey(moduleId, 'view'));

  const canAction = useCallback((actionId: string) => (
    hasPermission(moduleKey) && hasPermission(actionPermissionKey(moduleId, actionId))
  ), [hasPermission, moduleKey, moduleId]);

  const canDropdownOption = useCallback((groupId: string, optionId: string) => (
    hasPermission(moduleKey) && hasPermission(dropdownPermissionKey(moduleId, groupId, optionId))
  ), [hasPermission, moduleKey, moduleId]);

  const filterDropdownOptions = useCallback(<T,>(
    groupId: string,
    options: readonly T[],
    getOptionId: (option: T) => string,
  ): T[] => options.filter((option) => canDropdownOption(groupId, getOptionId(option))), [canDropdownOption]);

  return { canView, canAction, canDropdownOption, filterDropdownOptions };
}
