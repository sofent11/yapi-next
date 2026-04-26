import { Button, Select, Text, TextInput } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import type { AuthConfig, EnvironmentDocument, RequestDocument, ResolvedRequestPreview } from '@yapi-debugger/schema';

interface AuthPanelProps {
  auth: AuthConfig;
  requestName: string;
  selectedEnvironment: EnvironmentDocument | null;
  resolvedPreview: ResolvedRequestPreview;
  onAuthChange: (auth: AuthConfig) => void;
  onRefreshRequestAuth?: () => void;
  onSaveAuthProfile?: (name: string, auth: AuthConfig) => void;
}

function authTypeOptions() {
  return [
    { value: 'inherit', label: 'inherit' },
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' },
    { value: 'oauth2', label: 'oauth2' },
    { value: 'oauth1', label: 'oauth1' },
    { value: 'awsv4', label: 'aws signature v4' },
    { value: 'digest', label: 'digest' },
    { value: 'ntlm', label: 'ntlm' },
    { value: 'wsse', label: 'wsse' },
    { value: 'profile', label: 'environment profile' }
  ];
}

export function AuthPanel({
  auth,
  requestName,
  selectedEnvironment,
  resolvedPreview,
  onAuthChange,
  onRefreshRequestAuth,
  onSaveAuthProfile
}: AuthPanelProps) {
  const updateAuth = (patch: Partial<AuthConfig>) => {
    onAuthChange({ ...auth, ...patch });
  };

  return (
    <div className="settings-grid">
      <Select
        label="Auth Type"
        value={auth.type}
        data={authTypeOptions()}
        onChange={value => updateAuth({ type: (value as AuthConfig['type']) || 'inherit' })}
      />
      {auth.type === 'bearer' ? (
        <>
          <TextInput
            label="Bearer Token"
            value={auth.token || ''}
            onChange={event => updateAuth({ token: event.currentTarget.value })}
          />
          <TextInput
            label="Token Variable"
            placeholder="authToken"
            value={auth.tokenFromVar || ''}
            onChange={event => updateAuth({ tokenFromVar: event.currentTarget.value })}
          />
        </>
      ) : null}
      {auth.type === 'basic' ? (
        <>
          <TextInput
            label="Username"
            value={auth.username || ''}
            onChange={event => updateAuth({ username: event.currentTarget.value })}
          />
          <TextInput
            label="Username Variable"
            placeholder="basicUsername"
            value={auth.usernameFromVar || ''}
            onChange={event => updateAuth({ usernameFromVar: event.currentTarget.value })}
          />
          <TextInput
            label="Password"
            value={auth.password || ''}
            onChange={event => updateAuth({ password: event.currentTarget.value })}
          />
          <TextInput
            label="Password Variable"
            placeholder="basicPassword"
            value={auth.passwordFromVar || ''}
            onChange={event => updateAuth({ passwordFromVar: event.currentTarget.value })}
          />
        </>
      ) : null}
      {auth.type === 'apikey' ? (
        <>
          <TextInput
            label="Key"
            value={auth.key || ''}
            onChange={event => updateAuth({ key: event.currentTarget.value })}
          />
          <TextInput
            label="Value"
            value={auth.value || ''}
            onChange={event => updateAuth({ value: event.currentTarget.value })}
          />
          <TextInput
            label="Value Variable"
            placeholder="apiKeyValue"
            value={auth.valueFromVar || ''}
            onChange={event => updateAuth({ valueFromVar: event.currentTarget.value })}
          />
          <Select
            label="Send To"
            value={auth.addTo || 'header'}
            data={[
              { value: 'header', label: 'Header' },
              { value: 'query', label: 'Query' }
            ]}
            onChange={value => updateAuth({ addTo: (value as AuthConfig['addTo']) || 'header' })}
          />
        </>
      ) : null}
      {auth.type === 'oauth2' ? (
        <>
          <Select
            label="OAuth Flow"
            value={auth.oauthFlow || 'client_credentials'}
            data={[
              { value: 'client_credentials', label: 'client_credentials' },
              { value: 'authorization_code', label: 'authorization_code' },
              { value: 'password', label: 'password' },
              { value: 'implicit', label: 'implicit' }
            ]}
            onChange={value => updateAuth({ oauthFlow: (value as AuthConfig['oauthFlow']) || 'client_credentials' })}
          />
          {auth.oauthFlow === 'authorization_code' || auth.oauthFlow === 'implicit' ? (
            <>
              <TextInput
                label="Authorization URL"
                value={auth.authorizationUrl || ''}
                onChange={event => updateAuth({ authorizationUrl: event.currentTarget.value })}
              />
              <TextInput
                label="Callback URL"
                value={auth.callbackUrl || ''}
                onChange={event => updateAuth({ callbackUrl: event.currentTarget.value })}
              />
            </>
          ) : null}
          <TextInput
            label="Token URL"
            placeholder="https://auth.example.com/oauth/token"
            value={auth.tokenUrl || ''}
            onChange={event => updateAuth({ tokenUrl: event.currentTarget.value })}
          />
          <TextInput
            label="Client ID"
            value={auth.clientId || ''}
            onChange={event => updateAuth({ clientId: event.currentTarget.value })}
          />
          <TextInput
            label="Client ID Variable"
            placeholder="oauthClientId"
            value={auth.clientIdFromVar || ''}
            onChange={event => updateAuth({ clientIdFromVar: event.currentTarget.value })}
          />
          <TextInput
            label="Client Secret"
            value={auth.clientSecret || ''}
            onChange={event => updateAuth({ clientSecret: event.currentTarget.value })}
          />
          <TextInput
            label="Client Secret Variable"
            placeholder="oauthClientSecret"
            value={auth.clientSecretFromVar || ''}
            onChange={event => updateAuth({ clientSecretFromVar: event.currentTarget.value })}
          />
          <TextInput
            label="Scope"
            placeholder="read:users write:orders"
            value={auth.scope || ''}
            onChange={event => updateAuth({ scope: event.currentTarget.value })}
          />
          <Select
            label="Token Placement"
            value={auth.tokenPlacement || 'header'}
            data={[
              { value: 'header', label: 'Header' },
              { value: 'query', label: 'Query' }
            ]}
            onChange={value => updateAuth({ tokenPlacement: (value as AuthConfig['tokenPlacement']) || 'header' })}
          />
          <TextInput
            label="Token Name"
            placeholder={auth.tokenPlacement === 'query' ? 'access_token' : 'Authorization'}
            value={auth.tokenName || ''}
            onChange={event => updateAuth({ tokenName: event.currentTarget.value })}
          />
          <TextInput
            label="Token Prefix"
            placeholder="Bearer"
            value={auth.tokenPrefix || ''}
            onChange={event => updateAuth({ tokenPrefix: event.currentTarget.value })}
          />
          {resolvedPreview.authState?.type === 'oauth2' ? (
            <div className="preview-note">
              <Text size="xs" c="dimmed">
                Cache {resolvedPreview.authState.cacheStatus}
                {resolvedPreview.authState.expiresAt ? ` · expires ${resolvedPreview.authState.expiresAt}` : ''}
              </Text>
            </div>
          ) : null}
          {onRefreshRequestAuth ? (
            <div className="preview-note">
              <Button size="xs" variant="default" onClick={onRefreshRequestAuth}>
                Refresh OAuth Token
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {auth.type === 'oauth1' ? (
        <>
          <TextInput label="Consumer Key" value={auth.consumerKey || ''} onChange={event => updateAuth({ consumerKey: event.currentTarget.value })} />
          <TextInput label="Consumer Secret" value={auth.consumerSecret || ''} onChange={event => updateAuth({ consumerSecret: event.currentTarget.value })} />
          <TextInput label="Token" value={auth.token || ''} onChange={event => updateAuth({ token: event.currentTarget.value })} />
          <TextInput label="Token Secret" value={auth.clientSecret || ''} onChange={event => updateAuth({ clientSecret: event.currentTarget.value })} />
        </>
      ) : null}
      {auth.type === 'awsv4' ? (
        <>
          <TextInput label="Access Key" value={auth.accessKey || ''} onChange={event => updateAuth({ accessKey: event.currentTarget.value })} />
          <TextInput label="Secret Key" value={auth.secretKey || ''} onChange={event => updateAuth({ secretKey: event.currentTarget.value })} />
          <TextInput label="Region" value={auth.region || ''} onChange={event => updateAuth({ region: event.currentTarget.value })} />
          <TextInput label="Service" value={auth.service || ''} onChange={event => updateAuth({ service: event.currentTarget.value })} />
          <TextInput label="Session Token" value={auth.sessionToken || ''} onChange={event => updateAuth({ sessionToken: event.currentTarget.value })} />
        </>
      ) : null}
      {auth.type === 'digest' || auth.type === 'ntlm' || auth.type === 'wsse' ? (
        <>
          <TextInput label="Username" value={auth.username || ''} onChange={event => updateAuth({ username: event.currentTarget.value })} />
          <TextInput label="Password" value={auth.password || ''} onChange={event => updateAuth({ password: event.currentTarget.value })} />
          {auth.type === 'ntlm' ? (
            <>
              <TextInput label="Domain" value={auth.domain || ''} onChange={event => updateAuth({ domain: event.currentTarget.value })} />
              <TextInput label="Workstation" value={auth.workstation || ''} onChange={event => updateAuth({ workstation: event.currentTarget.value })} />
              <div className="preview-note">
                <Text size="xs" c="dimmed">
                  Desktop NTLM uses explicit username/password credentials only. Native OS/integrated enterprise flows are not available in this build.
                </Text>
              </div>
            </>
          ) : null}
          {auth.type === 'digest' ? (
            <>
              <TextInput label="Realm" value={auth.realm || ''} onChange={event => updateAuth({ realm: event.currentTarget.value })} />
              <TextInput label="Nonce" value={auth.nonce || ''} onChange={event => updateAuth({ nonce: event.currentTarget.value })} />
              <TextInput label="QOP" value={auth.qop || 'auth'} onChange={event => updateAuth({ qop: event.currentTarget.value })} />
              <TextInput label="Algorithm" value={auth.algorithm || 'MD5'} onChange={event => updateAuth({ algorithm: event.currentTarget.value })} />
              <TextInput label="Opaque" value={auth.opaque || ''} onChange={event => updateAuth({ opaque: event.currentTarget.value })} />
              <TextInput label="Client Nonce" value={auth.cnonce || ''} placeholder="Auto generated" onChange={event => updateAuth({ cnonce: event.currentTarget.value })} />
              <TextInput label="Nonce Count" value={auth.nonceCount || '00000001'} onChange={event => updateAuth({ nonceCount: event.currentTarget.value })} />
            </>
          ) : null}
          {auth.type === 'wsse' ? (
            <>
              <TextInput label="Nonce" value={auth.nonce || ''} placeholder="Auto generated" onChange={event => updateAuth({ nonce: event.currentTarget.value })} />
              <TextInput label="Created" value={auth.created || ''} placeholder="Auto generated ISO timestamp" onChange={event => updateAuth({ created: event.currentTarget.value })} />
              <TextInput label="Password Digest" value={auth.passwordDigest || ''} placeholder="Optional override" onChange={event => updateAuth({ passwordDigest: event.currentTarget.value })} />
            </>
          ) : null}
        </>
      ) : null}
      {auth.type === 'profile' ? (
        <Select
          label="Environment Profile"
          value={auth.profileName || null}
          data={(selectedEnvironment?.authProfiles || []).map(item => ({ value: item.name, label: item.name }))}
          onChange={value => updateAuth({ profileName: value || '' })}
        />
      ) : null}
      {selectedEnvironment?.authProfiles?.length ? (
        <div className="preview-note">
          <Text size="xs" c="dimmed">
            Active environment profiles: {selectedEnvironment.authProfiles.map(item => item.name).join(', ')}
          </Text>
        </div>
      ) : null}
      {onSaveAuthProfile && auth.type !== 'inherit' && auth.type !== 'none' ? (
        <div className="preview-note">
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              const seed = auth.profileName || requestName || 'auth-profile';
              onSaveAuthProfile?.(seed, auth);
            }}
          >
            保存为环境认证配置
          </Button>
        </div>
      ) : null}
    </div>
  );
}
