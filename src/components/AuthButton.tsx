import React from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { usePermissions } from '../hooks/usePermissions';

export const AuthButton: React.FC<ButtonProps> = (props) => {
  const { isDemo, requireAdmin } = usePermissions();

  if (isDemo) {
    return (
      <Tooltip title="Available for administrators only.">
        <span 
          style={{ display: 'inline-block', cursor: 'not-allowed' }}
          onClickCapture={(e) => requireAdmin(e)}
        >
          <Button
            {...props}
            disabled={true}
            style={{ ...props.style, pointerEvents: 'none' }}
          />
        </span>
      </Tooltip>
    );
  }

  return <Button {...props} />;
};
