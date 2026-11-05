import { History, Plus, Search, User as UserIcon } from 'lucide-react';
import { ConfirmModal, FormModal, LoadingState, PageHeader, PageToolbar } from '../components/common';
import EmptyState from '../components/EmptyState';
import { UserActivityLogTable } from './users/UserActivityLogTable';
import { UsersListTable } from './users/UsersListTable';
import { recoveredUserFromToggle } from './users/userRecovery';
import { useUsersPage } from '../hooks/useUsersPage';

export default function Users() {
  const {
    styles,
    canManageRoles,
    canResolveUserCreate,
    canViewUsers,
    canViewLogs,
    canUpdateUser,
    canDeleteUser,
    permissionsLoading,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    roles,
    formData,
    setFormData,
    pendingUserCreateRequest,
    activePendingUserEditRequest,
    activePendingUserDeleteRequest,
    activePendingUserToggleRequest,
    pendingEditCanSubmit,
    loading,
    userMutationPending,
    userMutationResolutionPending,
    usersRefreshing,
    usersMutationNotice,
    usersLoadError,
    logsLoadError,
    logsRefreshing,
    filteredUsers,
    filteredLogs,
    usersPage,
    setUsersPage,
    usersTotal,
    getRoleBadgeClass,
    getRoleLabel,
    openCreateModal,
    openEditModal,
    refreshUsers,
    refreshLogs,
    handleCreate,
    handleEdit,
    handleDelete,
    handleToggleEnable,
    verifyUserDeleteRecovery,
    verifyUserToggleRecovery,
    verifyUserEditRecovery,
    showCreateModal,
    setShowCreateModal,
    showEditModal,
    setShowEditModal,
    editingUser,
    setEditingUser,
    pendingDeleteUser,
    setPendingDeleteUser,
    userMutationLockRef,
  } = useUsersPage();

  const tabSwitch = (
    <div role="group" aria-label="人员管理视图" className={`flex w-fit gap-2 rounded-xl p-1 ${styles.bgSecondary} ${styles.border}`}>
      <button
        type="button"
        onClick={() => setActiveTab('users')}
        aria-pressed={activeTab === 'users'}
        className={`xmt-btn rounded-lg px-4 py-2 transition-colors ${activeTab === 'users' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`}`}
      >
        用户列表
      </button>
      {canViewLogs && (
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          aria-pressed={activeTab === 'logs'}
          className={`xmt-btn flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${activeTab === 'logs' ? styles.buttonPrimary : `${styles.textSecondary} ${styles.hoverBg}`}`}
        >
          <History className="h-4 w-4" />
          操作日志
        </button>
      )}
    </div>
  );

  const searchInput = (
    <div className="relative">
      <Search className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 ${styles.textSecondary}`} />
      <input
        id="users-admin-search"
        name="users-search"
        type="text"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        aria-label={activeTab === 'users' ? '搜索用户名、姓名或邮箱' : '搜索操作、用户或目标'}
        placeholder={activeTab === 'users' ? '搜索用户名、姓名或邮箱...' : '搜索操作、用户或目标...'}
        className={`xmt-field w-full rounded-lg py-2 pl-10 pr-4 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
      />
    </div>
  );

  const renderRoleSelect = (
    <select
      id="user-role"
      value={formData.role}
      disabled={Boolean(pendingUserCreateRequest || activePendingUserEditRequest)}
      onChange={(event) => setFormData({ ...formData, role: event.target.value })}
      className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`}
    >
      {roles.map((role) => (
        <option key={role.id} value={role.code}>
          {role.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="人员管理"
          description={canManageRoles ? '管理系统用户、角色分配和操作日志' : '查看系统用户和可访问的操作信息'}
          actions={
            activeTab === 'users' && canResolveUserCreate ? (
              <button type="button" disabled={loading || userMutationPending || usersRefreshing || userMutationResolutionPending} onClick={() => void openCreateModal()} className={`xmt-btn flex items-center gap-2 rounded-lg px-4 py-2 ${styles.buttonPrimary} !min-h-10 transition-colors disabled:cursor-not-allowed disabled:opacity-50`}>
                <Plus className="h-5 w-5" />
                添加用户
              </button>
            ) : undefined
          }
        />

        <PageToolbar left={tabSwitch} search={searchInput} />

        {activeTab === 'users' && (usersMutationNotice || usersLoadError || activePendingUserDeleteRequest || activePendingUserToggleRequest) ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">{activePendingUserDeleteRequest
              ? activePendingUserDeleteRequest.recoveryCheck === 'checking'
                ? '正在核实上次删除结果；核实期间其他人员修改已暂停。'
                : activePendingUserDeleteRequest.recoveryCheck === 'not_found'
                  ? '暂未找到删除完成记录；可用同一请求编号安全重试，服务端会避免重复删除。'
                  : usersMutationNotice || '暂时无法核实上次删除结果；原请求已保留，请先只读重新核实。'
              : activePendingUserToggleRequest
                ? activePendingUserToggleRequest.recoveryCheck === 'checking'
                  ? '正在核实上次用户启停结果；核实期间其他人员修改已暂停。'
                  : activePendingUserToggleRequest.recoveryCheck === 'not_found'
                    ? canUpdateUser
                      ? '暂未找到启停完成记录；可用同一请求编号安全重试。'
                      : '暂未找到启停完成记录；当前账号无权重试，原请求仍锁定，请只读重新核实。'
                    : `暂时无法核实用户 ${activePendingUserToggleRequest.username} 的启停结果；原请求已保留，所有人员修改继续暂停，请只读重新核实。`
                : usersMutationNotice || `用户列表暂不可用：${usersLoadError}`}</p>
            {activePendingUserDeleteRequest ? (
              <button
                type="button"
                disabled={userMutationPending || activePendingUserDeleteRequest.recoveryCheck === 'checking'}
                onClick={() => activePendingUserDeleteRequest.recoveryCheck === 'not_found' && canDeleteUser
                  ? void handleDelete()
                  : void verifyUserDeleteRecovery(activePendingUserDeleteRequest)}
                className={`xmt-btn self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} min-h-10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}
              >
                {userMutationPending || activePendingUserDeleteRequest.recoveryCheck === 'checking'
                  ? '正在核实删除'
                  : activePendingUserDeleteRequest.recoveryCheck === 'not_found' && canDeleteUser
                    ? '安全重试上次删除'
                    : '只读重新核实删除'}
              </button>
            ) : activePendingUserToggleRequest ? (
              <button
                type="button"
                disabled={permissionsLoading || userMutationPending || activePendingUserToggleRequest.recoveryCheck === 'checking'}
                onClick={() => activePendingUserToggleRequest.recoveryCheck === 'not_found' && canUpdateUser
                  ? void handleToggleEnable(recoveredUserFromToggle(activePendingUserToggleRequest))
                  : void verifyUserToggleRecovery(activePendingUserToggleRequest)}
                className={`xmt-btn self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} min-h-10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}
              >
                {permissionsLoading || userMutationPending || activePendingUserToggleRequest.recoveryCheck === 'checking'
                  ? '正在核实启停'
                  : activePendingUserToggleRequest.recoveryCheck === 'not_found' && canUpdateUser
                    ? '安全重试上次启停'
                    : '只读重新核实启停'}
              </button>
            ) : (
              canViewUsers ? (
                <button type="button" disabled={loading || usersRefreshing} onClick={() => void refreshUsers()} className={`xmt-btn self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} min-h-10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}>
                  {usersRefreshing ? '正在重新加载' : '重新加载列表'}
                </button>
              ) : null
            )}
          </div>
        ) : null}

        {activeTab === 'logs' && logsLoadError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-border-soft bg-studio-surface-soft p-4 text-sm text-studio-text-primary sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">操作日志暂不可用：{logsLoadError}</p>
            {canViewLogs ? (
              <button type="button" disabled={loading || logsRefreshing} onClick={() => void refreshLogs()} className={`xmt-btn self-start rounded-lg px-4 py-2 ${styles.buttonSecondary} min-h-10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto`}>
                {logsRefreshing ? '正在重新加载' : '重新加载日志'}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'users' && (
          <div className="min-w-0" data-testid="users-list" aria-busy={loading || usersRefreshing}>
            {loading ? (
              <div className={`${styles.bgSecondary} rounded-xl ${styles.border} px-6 py-12`}><LoadingState type="section" text="加载用户中..." /></div>
            ) : usersLoadError && filteredUsers.length === 0 ? null : filteredUsers.length === 0 ? (
              <div className={`${styles.bgSecondary} rounded-xl ${styles.border}`}><EmptyState icon={UserIcon} title="暂无用户" description="当前没有可显示的用户记录。" /></div>
            ) : (
              <UsersListTable
                users={filteredUsers}
                page={usersPage}
                total={usersTotal}
                styles={styles}
                canUpdateUser={canUpdateUser}
                canDeleteUser={canDeleteUser}
                mutationPending={userMutationPending}
                refreshing={usersRefreshing}
                resolutionPending={userMutationResolutionPending}
                onPageChange={setUsersPage}
                getRoleBadgeClass={getRoleBadgeClass}
                getRoleLabel={getRoleLabel}
                onToggle={(user) => void handleToggleEnable(user)}
                onEdit={(user) => void openEditModal(user)}
                onDelete={setPendingDeleteUser}
              />
            )}
          </div>
        )}

        {activeTab === 'logs' && canViewLogs && (
          <div className={`${styles.bgSecondary} overflow-hidden rounded-xl ${styles.border}`}>
            {loading ? (
              <div className="px-6 py-12"><LoadingState type="section" text="加载日志中..." /></div>
            ) : logsLoadError && filteredLogs.length === 0 ? null : filteredLogs.length === 0 ? (
              <EmptyState icon={History} title="暂无操作日志" description="当前没有可显示的操作记录。" />
            ) : (
              <UserActivityLogTable logs={filteredLogs} styles={styles} />
            )}
          </div>
        )}
      </div>

      <FormModal
        open={showCreateModal}
        title="添加用户"
        onCancel={() => { if (!userMutationLockRef.current && !pendingUserCreateRequest) setShowCreateModal(false); }}
        onSubmit={handleCreate}
        submitText={pendingUserCreateRequest ? '安全重试上次创建' : '保存'}
        cancelText="取消"
        loading={userMutationPending}
        locked={Boolean(pendingUserCreateRequest)}
        allowChildrenWhenLocked={Boolean(pendingUserCreateRequest?.requiresPasswordReentry)}
        allowSubmitWhenLocked={canResolveUserCreate && (!pendingUserCreateRequest?.requiresPasswordReentry || Boolean(formData.password))}
      >
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleCreate(); }}>
          {pendingUserCreateRequest ? (
            <p role="alert" className="rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast">
              {!canResolveUserCreate
                ? pendingUserCreateRequest.recoveryCheck === 'checking'
                  ? '当前账号没有创建权限；系统仍会只读核实上次请求，权限恢复前不会重试。用户名、姓名、邮箱和角色已锁定，密码不会保存在浏览器恢复记录中。'
                  : pendingUserCreateRequest.recoveryCheck === 'not_found'
                    ? '服务器未找到上次创建记录，但当前账号没有创建权限。原请求标记会保留；权限恢复并刷新页面后，才能重新核实并安全重试同一请求。'
                    : '当前账号没有创建权限，且暂时无法核实上次创建结果。原请求标记会保留；请恢复权限后刷新页面继续核实，不会发起写入。'
                : pendingUserCreateRequest.requiresPasswordReentry
                  ? pendingUserCreateRequest.recoveryCheck === 'checking'
                    ? '正在只读核实上次创建结果。用户名、姓名、邮箱和角色已锁定；密码不会保存在浏览器恢复记录中。'
                    : pendingUserCreateRequest.recoveryCheck === 'not_found'
                      ? '服务器未找到上次创建记录。用户名、姓名、邮箱和角色已锁定；请输入上次创建时使用的密码，再安全重试同一请求。密码不会保存在浏览器恢复记录中。'
                      : pendingUserCreateRequest.recoveryCheck === 'unavailable'
                        ? '当前无法核实上次创建结果。用户名、姓名、邮箱和角色已锁定；请输入上次创建时使用的密码，再安全重试同一请求。密码不会保存在浏览器恢复记录中。'
                        : '刷新后尚未核实上次创建结果。用户名、姓名、邮箱和角色已锁定；请输入上次创建时使用的密码，再安全重试同一请求。密码不会保存在浏览器恢复记录中。'
                  : '上次创建结果尚未确认。为避免重复创建账号，表单已锁定；再次保存会安全重试同一请求。'}
            </p>
          ) : null}
          <div>
            <label htmlFor="create-user-username" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名 *</label>
            <input id="create-user-username" type="text" autoComplete="username" value={formData.username} disabled={Boolean(pendingUserCreateRequest)} onChange={(event) => setFormData({ ...formData, username: event.target.value })} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder="请输入用户名" />
          </div>
          <div>
            <label htmlFor="create-user-password" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码 *</label>
            <input id="create-user-password" type="password" autoComplete="new-password" value={formData.password} disabled={Boolean(pendingUserCreateRequest && (!pendingUserCreateRequest.requiresPasswordReentry || !canResolveUserCreate))} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder={pendingUserCreateRequest?.requiresPasswordReentry ? '请输入上次创建时使用的密码' : '请输入密码'} />
          </div>
          <div>
            <label htmlFor="create-user-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input id="create-user-name" type="text" autoComplete="name" value={formData.name} disabled={Boolean(pendingUserCreateRequest)} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder="请输入姓名" />
          </div>
          <div>
            <label htmlFor="create-user-email" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input id="create-user-email" type="email" autoComplete="email" value={formData.email} disabled={Boolean(pendingUserCreateRequest)} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder="请输入邮箱" />
          </div>
          <div>
            <label htmlFor="user-role" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            {renderRoleSelect}
          </div>
        </form>
      </FormModal>

      <FormModal
        open={showEditModal && Boolean(editingUser)}
        title="编辑用户"
        onCancel={() => { if (!userMutationLockRef.current && !activePendingUserEditRequest) { setShowEditModal(false); setEditingUser(null); } }}
        onSubmit={handleEdit}
        submitText={activePendingUserEditRequest ? '安全重试上次保存' : '保存'}
        cancelText="取消"
        loading={userMutationPending}
        locked={Boolean(activePendingUserEditRequest && editingUser?.id === activePendingUserEditRequest.targetUserId)}
        allowChildrenWhenLocked={Boolean(activePendingUserEditRequest?.recoveryCheck)}
        allowSubmitWhenLocked={pendingEditCanSubmit}
      >
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleEdit(); }}>
          {activePendingUserEditRequest ? (
            <p role="alert" className="rounded-xl border border-studio-border-soft bg-studio-amber-soft px-4 py-3 text-sm text-studio-amber-contrast">
              {activePendingUserEditRequest.recoveryCheck === 'checking'
                ? '正在只读核实刷新前的用户更新。所有字段已锁定，恢复记录不含密码。'
                : activePendingUserEditRequest.recoveryCheck === 'not_found'
                  ? activePendingUserEditRequest.hasPassword
                    ? '服务器未找到上次更新记录。原字段已锁定；请输入上次更新时使用的密码，再用同一请求安全重试。密码不会保存在浏览器恢复记录中。'
                    : '服务器未找到上次更新记录。原字段已锁定，可用同一请求安全重试。'
                  : activePendingUserEditRequest.recoveryCheck === 'unavailable'
                    ? '当前暂时无法核实上次更新结果。原字段已锁定；请只读重新核实，暂不重发更新。'
                    : '上次保存结果尚未确认。为避免重复修改密码、角色或会话，表单已锁定；再次保存会安全重试同一请求。'}
              {activePendingUserEditRequest.recoveryCheck === 'unavailable' ? (
                <button type="button" disabled={permissionsLoading || userMutationPending} onClick={() => void verifyUserEditRecovery(activePendingUserEditRequest)} className={`xmt-btn ml-2 rounded-lg px-3 py-1 ${styles.buttonSecondary} min-h-10 disabled:cursor-not-allowed disabled:opacity-50`}>
                  {userMutationPending ? '正在核实' : '只读重新核实'}
                </button>
              ) : null}
            </p>
          ) : null}
          <div>
            <label htmlFor="edit-user-username" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>用户名</label>
            <input id="edit-user-username" type="text" autoComplete="username" value={formData.username} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} focus:outline-none focus:ring-2 focus:ring-studio-primary`} disabled />
          </div>
          <div>
            <label htmlFor="edit-user-password" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>密码（留空则不修改）</label>
            <input id="edit-user-password" type="password" autoComplete="new-password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} disabled={Boolean(activePendingUserEditRequest && !(activePendingUserEditRequest.requiresPasswordReentry && activePendingUserEditRequest.recoveryCheck === 'not_found'))} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} placeholder={activePendingUserEditRequest?.requiresPasswordReentry ? '请输入上次更新时使用的密码' : '留空则不修改密码'} />
          </div>
          <div>
            <label htmlFor="edit-user-name" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>姓名</label>
            <input id="edit-user-name" type="text" autoComplete="name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={Boolean(activePendingUserEditRequest)} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} />
          </div>
          <div>
            <label htmlFor="edit-user-email" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>邮箱</label>
            <input id="edit-user-email" type="email" autoComplete="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={Boolean(activePendingUserEditRequest)} className={`xmt-field w-full rounded-lg px-4 py-2 ${styles.bgInput} ${styles.borderInput} ${styles.textPrimary} ${styles.textPlaceholder} focus:outline-none focus:ring-2 focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} />
          </div>
          <div>
            <label htmlFor="user-role" className={`mb-2 block text-sm font-medium ${styles.textSecondary}`}>角色</label>
            {renderRoleSelect}
          </div>
          <label htmlFor="enabled" className={`flex min-h-10 items-center gap-3 ${styles.textSecondary}`}>
            <input type="checkbox" id="enabled" checked={formData.enabled} onChange={(event) => setFormData({ ...formData, enabled: event.target.checked })} disabled={Boolean(activePendingUserEditRequest)} className={`h-5 w-5 rounded ${styles.borderInput} ${styles.bgInput} text-studio-primary focus:ring-studio-primary disabled:cursor-not-allowed disabled:opacity-60`} />
            <span>启用用户</span>
          </label>
        </form>
      </FormModal>

      <ConfirmModal
        open={Boolean(pendingDeleteUser)}
        title="确认删除用户"
        description={pendingDeleteUser ? `确定要删除用户「${pendingDeleteUser.username}」吗？该操作执行后将无法恢复。` : '确定要删除该用户吗？'}
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={userMutationPending}
        onConfirm={handleDelete}
        onCancel={() => { if (!userMutationLockRef.current) setPendingDeleteUser(null); }}
      />
    </>
  );
}
