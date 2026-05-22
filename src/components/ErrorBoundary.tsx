import React from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { warningOutline } from 'ionicons/icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ 应用错误:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '24px',
            textAlign: 'center',
            backgroundColor: '#f5f5f5'
          }}
        >
          <IonIcon icon={warningOutline} style={{ fontSize: '48px', marginBottom: '16px', color: '#999' }} aria-hidden="true" />

          <h2 style={{ marginBottom: '8px', color: '#333' }}>应用出现了问题</h2>
          <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <IonButton
            color="primary"
            size="large"
            onClick={this.handleReset}
          >
            重新加载应用
          </IonButton>
          {import.meta.env.DEV && (
            <details style={{ marginTop: '24px', textAlign: 'left', maxWidth: '500px' }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>
                查看详细错误信息
              </summary>
              <pre style={{ 
                marginTop: '12px', 
                padding: '12px', 
                backgroundColor: '#fff', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px'
              }}>
                {this.state.error?.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
