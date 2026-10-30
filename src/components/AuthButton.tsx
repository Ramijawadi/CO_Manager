import React from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { usePermissions } from '../hooks/usePermissions';

export const AuthButton: React.FC<ButtonProps & { employeeOnly?: boolean }> = ({ employeeOnly = false, ...props }) => {
  const { isReadOnly, requireWrite, deniedMessage } = usePermissions(employeeOnly);

  if (isReadOnly) {
    return (
      <Tooltip title={deniedMessage}>
        <span 
          style={{ display: 'inline-block', cursor: 'not-allowed' }}
          onClickCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
            requireWrite();
          }}
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
