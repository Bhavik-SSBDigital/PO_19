// ==============================|| LOGO SVG ||============================== //

const Logo = () => {
  return (
    <div style={{ display: "flex" }}>
      <img
        height={30}
        // style={{ marginRight: "100px" }}
        // src={import.meta.env.PUBLIC_URL + "/logo.png"}
        src="/logo_newer.png"
        alt="logo"
        style={
          {
            // margin: "10px 0px",
            // mixBlendMode: multiply,
          }
        }
      />
    </div>
  );
};

export default Logo;
