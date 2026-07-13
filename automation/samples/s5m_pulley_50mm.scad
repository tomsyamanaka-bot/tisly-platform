$fn = 100; // 円の滑らかさ設定

tooth_count = 24;      // 歯数
pitch = 5;             // S5M規格のピッチ (5mm)
pulley_width = 50;     // ベルト幅50mm
shaft_dia = 8.2;       // モーター軸径 (印刷の縮みを考慮)
flange_thick = 2.5;    // ツバの厚み
flange_dia_offset = 6; // ツバの外径補正

pitch_dia = (tooth_count * pitch) / PI;
outer_dia = pitch_dia - 1.91;
flange_dia = outer_dia + flange_dia_offset;

difference() {
    union() {
        cylinder(d=flange_dia, h=flange_thick);
        translate([0, 0, flange_thick])
            cylinder(d=outer_dia, h=pulley_width);
        translate([0, 0, flange_thick + pulley_width])
            cylinder(d=flange_dia, h=flange_thick);
            
        translate([0, 0, flange_thick]) {
            for (i = [0 : tooth_count - 1]) {
                rotate([0, 0, i * (360 / tooth_count)])
                translate([outer_dia / 2 - 0.5, 0, 0])
                linear_extrude(height = pulley_width)
                polygon(points=[[0, -1.8], [1.91, -1.2], [1.91, 1.2], [0, 1.8]]);
            }
        }
    }
    
    translate([0, 0, -1])
        cylinder(d=shaft_dia, h=pulley_width + flange_thick * 2 + 2);
        
    translate([0, 0, flange_thick + pulley_width / 2]) {
        rotate([0, 90, 0]) {
            cylinder(d=4.2, h=outer_dia);
            translate([0, 0, shaft_dia / 2 + 2])
                rotate([0, 0, 30])
                cylinder(d=7.2 / cos(30), h=3.5, $fn=6);
        }
    }
}
