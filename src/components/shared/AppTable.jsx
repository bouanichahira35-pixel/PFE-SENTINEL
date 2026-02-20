import './AppTable.css';

const AppTable = ({ headers = [], className = '', children }) => {
  return (
    <table className={`app-table ${className}`.trim()} role="table">
      <thead>
        <tr>
          {headers.map((header) => {
            const key = typeof header === 'string' ? header : header.key || header.label;
            const label = typeof header === 'string' ? header : header.label;
            const thClassName = typeof header === 'string' ? '' : (header.className || '');
            return (
              <th key={key} scope="col" className={thClassName}>
                {label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
};

export default AppTable;
